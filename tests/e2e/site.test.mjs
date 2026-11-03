import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, launch, makeBackend, wire, watchErrors } from "./harness.mjs";

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });

async function open(opts = {}, route = "") {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } }), page = await ctx.newPage();
  const backend = await wire(page, server.url, makeBackend(opts)), errs = watchErrors(page);
  await page.goto(`${server.url}/#/${route}`);
  return { page, backend, errs, ctx };
}
const noJunk = async (page) => assert.ok(!/\bnull\b|\bundefined\b|NaN/.test(await page.locator("main").innerText()), "page shows null/undefined/NaN text");

test("Today: prices, change log, news, forecast and meters render with data", async () => {
  const { page, errs, ctx } = await open();
  await page.waitForSelector(".price .big"); await page.waitForSelector(".meterc .meter");
  assert.equal(await page.locator(".prices .price").count(), 4);
  const card24 = await page.locator(".price").first().innerText();
  assert.match(card24, /Gold 24K/); assert.match(card24, /₹[\d,]+\s*\/ gram/); assert.match(card24, /\/ 10 g/); assert.match(card24, /IST/);
  assert.match(await page.locator(".price.silver").innerText(), /\/ kg/);
  assert.ok((await page.locator(".timeline tbody tr").count()) >= 1, "price change log has rows");
  assert.match(await page.locator(".timeline").innerText(), /IST/);
  assert.equal(await page.locator(".forecast tbody tr").count(), 3);
  assert.match(await page.locator(".forecast").innerText(), /not financial advice/i);
  assert.equal(await page.locator(".meterc .meter").count(), 2);
  assert.match(await page.locator(".watch").innerText(), /Happened overnight/);
  assert.match(await page.locator(".notice").first().innerText(), /estimated Indian rates|out of date/);
  await noJunk(page); assert.deepEqual(errs, []); await ctx.close();
});

test("Today: news links only for trusted domains; untrusted source is plain text", async () => {
  const { page, ctx } = await open();
  await page.waitForSelector(".news li");
  const hrefs = await page.locator(".news a").evaluateAll((as) => as.map((a) => a.href));
  assert.ok(hrefs.some((h) => h.includes("reuters.com")) && hrefs.some((h) => h.includes("bls.gov")));
  assert.ok(!hrefs.some((h) => h.includes("evil.example")));
  assert.equal(await page.locator('.news a[target=_blank]').evaluateAll((as) => as.every((a) => /noopener/.test(a.rel))), true);
  await ctx.close();
});

test("Today: with no data it says so instead of showing numbers", async () => {
  const { page, ctx } = await open({ empty: true });
  await page.waitForSelector(".empty");
  assert.match(await page.locator("main").innerText(), /No prices yet/);
  assert.equal(await page.locator(".price .big").count(), 0);
  await ctx.close();
});

test("Today: warns when the last price check is old", async () => {
  const { page, ctx } = await open({ staleHours: 6 });
  await page.waitForSelector(".notice.warn");
  assert.match(await page.locator(".notice.warn").first().innerText(), /may be out of date/i);
  await ctx.close();
});

test("Today: if the backend is unreachable no prices are shown, only an honest error", async () => {
  const ctx = await browser.newContext(), page = await ctx.newPage();
  await page.route("**/js/config.js", (r) => r.fulfill({ contentType: "text/javascript", body: `export const SUPABASE_URL="https://fake.supabase.co";export const SUPABASE_ANON_KEY="x";` }));
  await page.route("https://fake.supabase.co/**", (r) => r.abort());
  await page.goto(`${server.url}/#/`); await page.waitForSelector(".notice.bad");
  assert.match(await page.locator("main").innerText(), /rather than guess/);
  assert.equal(await page.locator(".price .big").count(), 0);
  await ctx.close();
});

test("Price history: ranges, hover read-out and estimate labelling", async () => {
  const { page, errs, ctx } = await open({}, "charts");
  await page.waitForSelector(".chart-svg");
  for (const r of ["1M", "1Y", "3Y"]) { await page.click(`.seg button:has-text("${r}")`); await page.waitForSelector(".chart-svg"); }
  const box = await page.locator(".chart-svg").boundingBox(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  assert.match(await page.locator(".chart-svg .info").textContent(), /₹[\d,]+ \(estimate\).*high.*low/);
  assert.match(await page.locator(".stats").innerText(), /History from/);
  assert.match(await page.locator("main").innerText(), /Estimated history/);
  await page.click('.seg button:has-text("Silver")'); await page.waitForSelector(".chart-svg");
  assert.deepEqual(errs, []); await ctx.close();
});

test("My Gold: signed-out visitors see only the login and the purchases API is never called", async () => {
  const { page, backend, ctx } = await open({}, "my-gold");
  await page.waitForSelector(".auth");
  assert.match(await page.locator(".auth").innerText(), /private to your account/);
  assert.equal(await page.locator(".addform").count(), 0);
  assert.ok(!backend.requests.some((r) => r.path.includes("/purchases")), "purchases requested without a token");
  await ctx.close();
});

// ---- the bug the owner reported: "Create account does nothing" ----
const signUpCases = [
  ["short password", {}, "short", /at least 12 characters/, "bad"],
  ["email confirmation on", { authMode: "confirm" }, "correct horse battery", /We sent a confirmation link to a@b\.co/, "good"],
  ["email rate limit", { authMode: "ratelimit" }, "correct horse battery", /Too many attempts or emails/, "bad"],
  ["sign-ups disabled", { authMode: "disabled" }, "correct horse battery", /switched off/, "bad"],
  ["server unreachable", { authMode: "offline" }, "correct horse battery", /Couldn't reach the server/, "bad"],
];
for (const [name, opts, pw, expected, kind] of signUpCases) {
  test(`Create account (${name}) always shows a clear, visible message`, async () => {
    const { page, ctx } = await open(opts, "my-gold");
    await page.waitForSelector(".auth");
    await page.fill("input[type=email]", "a@b.co"); await page.fill("input[type=password]", pw);
    await page.click('button:has-text("Create account")');
    const note = page.locator(`.authmsg .notice.${kind}`); await note.waitFor({ timeout: 4000 });
    assert.match(await note.innerText(), expected);
    assert.ok(await note.isVisible());
    assert.equal(await page.locator('button:has-text("Create account")').isDisabled(), false, "buttons are usable again afterwards");
    await ctx.close();
  });
}
test("Create/Sign in with an empty or invalid email explains what to fix", async () => {
  const { page, ctx } = await open({}, "my-gold"); await page.waitForSelector(".auth");
  await page.click('button:has-text("Create account")');
  assert.match(await page.locator(".authmsg").innerText(), /valid email/i);
  await page.fill("input[type=email]", "a@b.co"); await page.click('button:has-text("Sign in")');
  assert.match(await page.locator(".authmsg").innerText(), /enter your password/i);
  await ctx.close();
});
test("Sign in with a wrong password gives a helpful message", async () => {
  const { page, ctx } = await open({}, "my-gold"); await page.waitForSelector(".auth");
  await page.fill("input[type=email]", "a@b.co"); await page.fill("input[type=password]", "wrong password here");
  await page.click('button:has-text("Sign in")');
  await page.waitForSelector(".authmsg .notice.bad");
  assert.match(await page.locator(".authmsg").innerText(), /confirmed your email/);
  await ctx.close();
});

test("My Gold: full journey. sign up, add purchases, see profit/loss and +50% alert, validation, delete, sign out", async () => {
  const { page, backend, errs, ctx } = await open({}, "my-gold");
  await page.waitForSelector(".auth");
  await page.fill("input[type=email]", "me@example.com"); await page.fill("input[type=password]", "correct horse battery");
  await page.click('button:has-text("Create account")'); await page.waitForSelector(".addform");
  const day = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10), fill = (n, v) => page.fill(`[name=${n}]`, v);
  const add = async (grams, paid, daysAgo = 400) => { await page.selectOption("[name=metal]", "gold"); await page.selectOption("[name=purity]", "22"); await fill("purchased_on", day(daysAgo)); await fill("grams", grams); await fill("total_paid", paid); await page.click('button:has-text("Save purchase")'); };
  await add("10", "60000"); await page.waitForSelector(".lot");
  // invalid entries are blocked with a reason and nothing is sent
  const before = backend.purchases.length;
  await add("-3", "1000"); assert.match(await page.locator(".addform [aria-live]").textContent(), /Grams must be a positive number/);
  await fill("grams", "5"); await fill("total_paid", "100"); await fill("gst_amount", "500"); await page.click('button:has-text("Save purchase")');
  assert.match(await page.locator(".addform [aria-live]").textContent(), /cannot exceed the total paid/);
  assert.equal(backend.purchases.length, before);
  // numbers: cost vs value, profit/loss, sell alert (synthetic prices are far above 60,000 / 10 g so the +50% target is hit)
  const sum = await page.locator(".prices").innerText();
  assert.match(sum, /10\.00 g gold/); assert.match(sum, /₹60,000/); assert.match(sum, /Overall (profit|loss)/);
  assert.match(await page.locator(".notice.good").innerText(), /reached your \+50% target/);
  assert.match(await page.locator(".lot .verdict").first().innerText(), /Target reached/);
  assert.ok(backend.requests.filter((r) => r.path.includes("/purchases")).every((r) => r.auth?.startsWith("Bearer tok-")), "every purchases call carried the user's token");
  await noJunk(page);
  // delete and sign out
  page.once("dialog", (d) => d.accept()); await page.click("text=Delete"); await page.waitForSelector("text=No purchases yet");
  await page.click("text=Sign out"); await page.waitForSelector(".auth");
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  assert.ok(!stored.includes("total_paid") && !stored.includes("grams"), "purchase data must never be stored in the browser");
  assert.ok(!stored.includes("tok-me@example.com"), "session token removed on sign-out");
  assert.deepEqual(errs, []); await ctx.close();
});

test("My Gold: one user can never see another user's purchases", async () => {
  const { page, backend, ctx } = await open({}, "my-gold");
  backend.purchases.push({ id: "x1", owner: "someone-else@example.com", metal: "gold", purity: 24, grams: 99, total_paid: 999999, purchased_on: "2025-01-01", form: "coin" });
  await page.waitForSelector(".auth");
  await page.fill("input[type=email]", "me@example.com"); await page.fill("input[type=password]", "correct horse battery");
  await page.click('button:has-text("Create account")'); await page.waitForSelector(".addform");
  assert.match(await page.locator("main").innerText(), /No purchases yet/);
  assert.ok(!(await page.locator("main").innerText()).includes("999,999"));
  await ctx.close();
});

test("Layout: no horizontal scrolling on a phone", async () => {
  const { page, ctx } = await open();
  await page.setViewportSize({ width: 390, height: 800 }); await page.waitForSelector(".price .big");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await ctx.close();
});

test("How it works page explains sources and carries the disclaimer", async () => {
  const { page, ctx } = await open({}, "about"); await page.waitForSelector(".prose");
  const t = await page.locator("main").innerText();
  assert.match(t, /Where the prices come from/); assert.match(t, /Not financial or investment advice/);
  await ctx.close();
});
