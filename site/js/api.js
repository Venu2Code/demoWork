// Read-only public data + the signed-in user's private purchases, all through Supabase REST (no libraries).
// The publishable (or legacy anon) key goes ONLY in the apikey header. Authorization is sent only with a signed-in user's JWT.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { istDay } from "./lib/pricing.js";

export const configured = () => !!(SUPABASE_URL && SUPABASE_ANON_KEY);
const base = () => SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/";

export async function request(path, { token, method = "GET", body, headers = {} } = {}) {
  const res = await fetch(base() + path, { method, body: body ? JSON.stringify(body) : undefined, headers: { apikey: SUPABASE_ANON_KEY, ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json", ...headers } });
  const text = await res.text(); const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(json?.message || `Request failed (${res.status})`);
  return json;
}
/** Page through PostgREST's 1000-row cap so 3 years of daily rows always arrive complete. */
async function all(path, opts = {}) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const rows = await request(path, { ...opts, headers: { Range: `${from}-${from + 999}`, "Range-Unit": "items" } });
    out.push(...rows); if (rows.length < 1000) return out;
  }
}

export const TARGETS = [["gold", 24], ["gold", 22], ["gold", 18], ["silver", 999]];

export async function loadToday() {
  const today = istDay(new Date()), midnight = new Date(`${today}T00:00:00+05:30`).toISOString();
  const [latestRows, ticks, status, dailyToday] = await Promise.all([
    Promise.all(TARGETS.map(([m, p]) => request(`price_ticks?select=metal,purity,price_per_gram,raw_per_gram,adj_pct,source,observed_at&metal=eq.${m}&purity=eq.${p}&order=observed_at.desc&limit=1`))),
    request(`price_ticks?select=metal,purity,price_per_gram,observed_at&observed_at=gte.${midnight}&order=observed_at.asc&limit=500`),
    request("ingest_status?select=*"),
    request(`daily_prices?select=metal,purity,open,high,low,close,change_count&day=eq.${today}`),
  ]);
  const latest = { gold: {}, silver: {} }, meta = {};
  latestRows.flat().forEach((r) => { latest[r.metal][r.purity] = Number(r.price_per_gram); meta[`${r.metal}${r.purity}`] = r; });
  // previous close = last daily row before today
  const prev = {};
  await Promise.all(TARGETS.map(async ([m, p]) => { const r = await request(`daily_prices?select=day,close&metal=eq.${m}&purity=eq.${p}&day=lt.${today}&order=day.desc&limit=1`); if (r[0]) prev[`${m}${p}`] = { close: Number(r[0].close), day: r[0].day }; }));
  return { today, latest, meta, ticks, status, dailyToday, prev };
}
export const loadSeries = (metal, purity, sinceDay) => all(`daily_prices?select=day,open,high,low,close,is_estimate&metal=eq.${metal}&purity=eq.${purity}${sinceDay ? `&day=gte.${sinceDay}` : ""}&order=day.asc`);
export async function loadOutlook() {
  const today = istDay(new Date()), y = istDay(new Date(Date.now() - 864e5));
  const [news, f] = await Promise.all([
    request(`news_items?select=*&for_date=gte.${y}&order=for_date.desc,event_time.asc&limit=40`),
    request("forecasts?select=*&order=generated_on.desc&limit=12"),
  ]);
  const latestDay = f[0]?.generated_on;
  return { today, news, forecasts: f.filter((r) => r.generated_on === latestDay) };
}

// ---- private (needs a signed-in token; Row Level Security enforces ownership server-side) ----
export const listPurchases = (token) => request("purchases?select=*&order=purchased_on.desc", { token });
export const addPurchase = (token, row) => request("purchases", { token, method: "POST", body: row, headers: { Prefer: "return=representation" } });
export const deletePurchase = (token, id) => request(`purchases?id=eq.${encodeURIComponent(id)}`, { token, method: "DELETE" });

/** Refresh schedule published with the site (data/schedule.json). Null if unavailable. */
export async function loadSchedule() { try { const r = await fetch("data/schedule.json", { cache: "no-cache" }); return r.ok ? await r.json() : null; } catch { return null; } }
