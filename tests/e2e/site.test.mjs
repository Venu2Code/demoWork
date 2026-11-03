import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, launch, makeBackend, wire, watchErrors } from "./harness.mjs";

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); server?.stop(); });

async function open(opts = {}, route = "", fixedNow = null) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } }), page = await ctx.newPage();
  if (fixedNow) await page.clock.setFixedTime(new Date(fixedNow));          // deterministic "now" in the browser (India-time strings are explicit)
  const backend = await wire(page, server.url, makeBackend(opts)), errs = watchErrors(page);
  await page.goto(`${server.url}/#/${route}`);
  return { page, backend, errs, ctx };
}
const noJunk = async (page) => assert.ok(!/\bnull\b|\bundefined\b|NaN/.test(await page.locator("main").innerText()), "page shows null/undefined/NaN text");

test("Today: prices, change log, news, forecast and meters render with data", async () => {
  const { page, errs, ctx } = await open();
  await page.waitForSelector(".price .big"); await page.waitForSelector(".meterc .meter");
  assert.equal(await page.locator(".prices .price").count(), 3, "gold 24K, 22K, 18K only");
  const card24 = await page.locator(".price").first().innerText();
  assert.match(card24, /Gold 24K/); assert.match(card24, /₹[\d,]+\s*\/ gram/); assert.match(card24, /\/ 10 g/); assert.match(card24, /IST/);
  assert.ok(!/silver/i.test(await page.locator("main").innerText()), "silver is switched off, so it must not appear anywhere");
  assert.ok((await page.locator(".timeline tbody tr").count()) >= 1, "price change log has rows");
  assert.match(await page.locator(".timeline").innerText(), /IST/);
  assert.equal(await page.locator(".forecast tbody tr").count(), 3);
  assert.match(await page.locator(".forecast").innerText(), /not financial advice/i);
  assert.equal(await page.locator(".meterc .meter").count(), 1);
  assert.match(await page.locator(".watch").innerText(), /Happened overnight/);
  assert.ok(!(await page.locator(".watch").innerText()).includes("Yesterday headline"), "only today's overnight items are shown");
  assert.match(await page.locator(".watch").innerText(), /Unclear impact|Pushes gold up/);
  assert.match(await page.locator(".watch .fine").innerText(), /official and trusted sources/);
  assert.ok(!/claude/i.test(await page.locator(".watch").innerText()), "no claim that Claude wrote the news");
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

test("Today: warns only when a scheduled update was missed (Tuesday 19:45 IST, last check 10:05 IST)", async () => {
  const { page, ctx } = await open({ lastChecked: "2026-11-03T10:05:00+05:30" }, "", "2026-11-03T19:45:00+05:30");
  await page.waitForSelector(".notice.warn");
  assert.match(await page.locator(".notice.warn").first().innerText(), /may be out of date[\s\S]*scheduled update was missed/i);
  await ctx.close();
});
test("Today: no false 'out of date' warning overnight, and the next update time is shown", async () => {
  const { page, ctx } = await open({ lastChecked: "2026-11-03T20:02:00+05:30" }, "", "2026-11-03T23:00:00+05:30");
  await page.waitForSelector(".price .big");
  assert.equal(await page.locator(".notice.warn").count(), 0);
  assert.match(await page.locator(".titlebar").innerText(), /next update about 4 Nov, 09:30 am IST/i);
  await ctx.close();
});
test("Today: no false warning on Sunday; next update is Monday morning", async () => {
  const { page, ctx } = await open({ lastChecked: "2026-11-07T20:02:00+05:30" }, "", "2026-11-08T12:00:00+05:30");
  await page.waitForSelector(".price .big");
  assert.equal(await page.locator(".notice.warn").count(), 0);
  assert.match(await page.locator(".titlebar").innerText(), /next update about 9 Nov, 09:30 am IST/i);
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
  assert.equal(await page.locator('.seg button:has-text("Silver")').count(), 0, "no silver chart while silver is off");
  await page.click('.seg button:has-text("Gold 22K")'); await page.waitForSelector(".chart-svg");
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
  assert.deepEqual(await page.locator("[name=metal] option").allTextContents(), ["Gold"], "purchase form offers gold only");
  const sum = await page.locator(".prices").innerText();
  assert.ok(!/silver/i.test(sum));
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
  assert.match(t, /8 times a day, Monday to Saturday \(09:30, 11:00, 12:30, 14:00, 15:30, 17:00, 18:30, 20:00 IST\)/);
  assert.ok(!/silver/i.test(t), "silver is off");
  await ctx.close();
});

test("Silver can be switched back on from schedule.json (the code path stays alive)", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } }), page = await ctx.newPage();
  const backend = await wire(page, server.url, makeBackend()), errs = watchErrors(page);
  await page.route("**/data/schedule.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ metals: ["gold", "silver"], days: [1, 2, 3, 4, 5, 6], times: ["10:00", "13:00", "16:00", "19:00"], graceMinutes: 60 }) }));
  await page.goto(`${server.url}/#/`); await page.waitForSelector(".prices .price"); await page.waitForSelector(".meterc .meter");
  assert.equal(await page.locator(".prices .price").count(), 4);
  assert.match(await page.locator(".price.silver").innerText(), /\/ kg/);
  assert.match(await page.locator(".timeline thead").innerText(), /silver/i);
  assert.equal(await page.locator(".meterc .meter").count(), 2);
  assert.match(await page.locator("h1").first().innerText(), /gold & silver/);
  await page.goto(`${server.url}/#/charts`); await page.waitForSelector(".chart-svg");
  assert.equal(await page.locator('.seg button:has-text("Silver")').count(), 1);
  assert.deepEqual(errs, []); await ctx.close();
});

test("Forecast built from price swings only is labelled as such and says news does not move it", async () => {
  const { page, ctx } = await open({ statistical: true });
  await page.waitForSelector(".forecast tbody tr");
  assert.match(await page.locator(".forecast").innerText(), /Based on price swings only/);
  assert.match(await page.locator(".forecast").innerText(), /not a promise/i);
  await ctx.close();
});
