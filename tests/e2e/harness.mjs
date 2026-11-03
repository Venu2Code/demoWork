// Browser-test harness: a static server for site/ plus a FAKE in-memory Supabase answering like the real one.
// All data here is SYNTHETIC and exists only for tests. It is never shipped in site/ and never used by the data jobs.
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FINE = { 24: 1, 22: 0.916 / 0.999, 18: 0.75 / 0.999 };
export const FAKE = "https://fake.supabase.co";

export async function startServer(port = 8200 + Math.floor(Math.random() * 500)) {
  const proc = spawn("node", ["scripts/serve.mjs"], { cwd: ROOT, env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "pipe", "inherit"] });
  await new Promise((res, rej) => { proc.stdout.on("data", (d) => String(d).includes("http://") && res()); proc.on("exit", () => rej(new Error("server exited"))); setTimeout(() => rej(new Error("server start timeout")), 8000); });
  return { url: `http://localhost:${port}`, stop: () => proc.kill() };
}
export const launch = () => chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);
const istDay = (ms) => ymd(ms + 5.5 * 3600e3);

/** Deterministic synthetic market data. `opts.empty` = no prices at all; `opts.staleHours` = age of last check. */
export function makeBackend(opts = {}) {
  const now = Date.now(), nowIso = new Date(now).toISOString();
  const daily = []; let c = 6000;
  for (let i = 1100; i >= 1; i--) {
    c *= 1 + Math.sin(i / 40) * 0.003 + 0.0007 + (((i * 7919) % 13) - 6) / 4000;
    for (const p of [24, 22, 18]) daily.push({ day: ymd(now - i * 864e5), metal: "gold", purity: p, open: c * FINE[p] * 0.998, high: c * FINE[p] * 1.006, low: c * FINE[p] * 0.994, close: c * FINE[p], is_estimate: true, change_count: 0 });
    daily.push({ day: ymd(now - i * 864e5), metal: "silver", purity: 999, open: c / 80, high: c / 78, low: c / 82, close: c / 80, is_estimate: true, change_count: 0 });
  }
  const g24 = c * 1.06;
  const ticks = [];
  for (const [minAgo, k] of [[40, 0.996], [25, 1.003], [5, 1]]) {
    const at = new Date(now - minAgo * 60000).toISOString();
    if (istDay(Date.parse(at)) !== istDay(now)) continue;                 // keep only ticks that fall on today's IST day
    for (const p of [24, 22, 18]) ticks.push({ metal: "gold", purity: p, price_per_gram: +(g24 * k * FINE[p]).toFixed(2), observed_at: at });
    ticks.push({ metal: "silver", purity: 999, price_per_gram: +((g24 * k) / 80).toFixed(2), observed_at: at });
  }
  if (!ticks.length) for (const p of [24, 22, 18]) ticks.push({ metal: "gold", purity: p, price_per_gram: +(g24 * FINE[p]).toFixed(2), observed_at: new Date(now - 300000).toISOString() });
  if (!ticks.some((t) => t.metal === "silver")) ticks.push({ metal: "silver", purity: 999, price_per_gram: +(g24 / 80).toFixed(2), observed_at: new Date(now - 300000).toISOString() });
  const today = istDay(now), tomorrow = istDay(now + 864e5);
  const news = [
    { id: "n1", kind: "overnight", title: "US jobs data came in weaker than expected", summary: "Softer hiring numbers raised hopes of rate cuts, which usually supports gold.", url: "https://www.reuters.com/markets/", source: "reuters.com", impact: "bullish", event_time: null, for_date: today },
    { id: "n2", kind: "upcoming", title: "US CPI inflation release", summary: "A hotter reading can lift the dollar and weigh on gold; a cooler one helps it.", url: "https://www.bls.gov/cpi/", source: "bls.gov", impact: "uncertain", event_time: `${today}T20:00:00+05:30`, for_date: today },
    { id: "n3", kind: "upcoming", title: "Item from an untrusted domain", summary: "This points at a domain that is not allowlisted so it must render as plain text.", url: "https://evil.example/x", source: "evil.example", impact: "neutral", event_time: `${tomorrow}T10:00:00+05:30`, for_date: today },
  ];
  const forecasts = [];
  for (const [m, p, k] of [["gold", 24, 1], ["gold", 22, FINE[22]], ["gold", 18, FINE[18]], ["silver", 999, 1 / 80]]) for (let h = 1; h <= 3; h++) { const mid = g24 * k * (1 + 0.002 * h); forecasts.push({ generated_on: today, metal: m, purity: p, horizon: h, low: mid * (1 - 0.01 * h), center: mid, high: mid * (1 + 0.01 * h), bias: 0.4, confidence: "medium", rationale: "Softer US data supports gold; CPI later is the main risk.", model: "test" }); }
  return {
    daily: opts.empty ? [] : daily, ticks: opts.empty ? [] : ticks, news, forecasts: opts.empty ? [] : forecasts,
    status: [{ source: "goldapi.io", last_checked: opts.lastChecked || new Date(now - (opts.staleHours ?? 0.05) * 3600e3).toISOString(), last_ok: true, note: "ok" }],
    purchases: [], users: new Map(), requests: [], nowIso, today,
    authMode: opts.authMode || "open",           // open | confirm | ratelimit | disabled | offline
  };
}

/** Wire a page to the fake backend. Returns the backend so tests can inspect `requests` and `purchases`. */
export async function wire(page, siteUrl, backend) {
  await page.route("**/js/config.js", (r) => r.fulfill({ contentType: "text/javascript", body: `export const SUPABASE_URL="${FAKE}";export const SUPABASE_ANON_KEY="sb_publishable_test";` }));
  await page.route(`${FAKE}/**`, async (r) => {
    const req = r.request(), u = new URL(req.url()), m = req.method(), hdr = req.headers(), json = (o, s = 200) => r.fulfill({ status: s, contentType: "application/json", body: JSON.stringify(o) });
    backend.requests.push({ method: m, path: u.pathname, auth: hdr.authorization || null });
    if (backend.authMode === "offline" && u.pathname.startsWith("/auth/")) return r.abort();
    if (u.pathname.startsWith("/auth/v1/")) {
      const body = req.postData() ? JSON.parse(req.postData()) : {};
      const sess = (email) => ({ access_token: "tok-" + email, refresh_token: "r", expires_in: 3600, user: { id: "id-" + email, email } });
      if (u.pathname.endsWith("/signup")) {
        if (backend.authMode === "ratelimit") return json({ code: 429, error_code: "over_email_send_rate_limit", msg: "email rate limit exceeded" }, 429);
        if (backend.authMode === "disabled") return json({ code: 422, error_code: "signup_disabled", msg: "Signups not allowed for this instance" }, 422);
        backend.users.set(body.email, body.password);
        return backend.authMode === "confirm" ? json({ id: "id-" + body.email, email: body.email, confirmation_sent_at: backend.nowIso }) : json(sess(body.email));
      }
      if (u.pathname.endsWith("/token")) return backend.users.get(body.email) === body.password ? json(sess(body.email)) : json({ code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" }, 400);
    }
    const table = u.pathname.replace("/rest/v1/", ""), q = (k) => u.searchParams.get(k);
    if (table === "purchases") {
      const owner = (hdr.authorization || "").replace("Bearer tok-", "");
      if (!owner || owner === hdr.authorization) return json({ message: "permission denied" }, 401);           // RLS: no token, no data
      if (m === "GET") return json(backend.purchases.filter((p) => p.owner === owner).map(({ owner: _o, ...p }) => p));
      if (m === "POST") { const row = { id: "p" + backend.purchases.length, created_at: backend.nowIso, owner, ...JSON.parse(req.postData()) }; backend.purchases.unshift(row); const { owner: _o, ...pub } = row; return json([pub], 201); }
      if (m === "DELETE") { backend.purchases = backend.purchases.filter((p) => !(p.owner === owner && p.id === q("id").replace("eq.", ""))); return r.fulfill({ status: 204, body: "" }); }
    }
    if (table === "ingest_status") return json(backend.status);
    if (table === "news_items") return json(backend.news);
    if (table === "forecasts") return json(backend.forecasts);
    if (table === "price_ticks") { if (/limit=1(&|$)/.test(u.search)) { const mm = q("metal").replace("eq.", ""), pp = Number(q("purity").replace("eq.", "")); return json(backend.ticks.filter((x) => x.metal === mm && x.purity === pp).slice(-1).map((x) => ({ ...x, raw_per_gram: 1, adj_pct: 6, source: "goldapi.io" }))); } return json(backend.ticks); }
    if (table === "daily_prices") {
      const mm = q("metal")?.replace("eq.", ""), pp = Number(q("purity")?.replace("eq.", "")), dq = q("day");
      let rows = backend.daily.filter((x) => (!mm || x.metal === mm) && (!pp || x.purity === pp));
      if (dq?.startsWith("gte.")) rows = rows.filter((x) => x.day >= dq.slice(4));
      if (dq?.startsWith("lt.")) rows = rows.filter((x) => x.day < dq.slice(3)).reverse().slice(0, 1);
      if (dq?.startsWith("eq.")) rows = [];
      const rg = hdr.range; if (rg) { const [a, z] = rg.split("-").map(Number); rows = rows.slice(a, z + 1); }
      return json(rows);
    }
    return json([]);
  });
  return backend;
}

/** Collect console errors/warnings and uncaught exceptions (this also catches CSP violations). */
export function watchErrors(page) {
  const errs = []; page.on("console", (m) => { if (["error", "warning"].includes(m.type()) && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  page.on("pageerror", (e) => errs.push("PAGEERROR " + e.message)); return errs;
}
