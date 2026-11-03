// Pure helpers for building ~3 years of daily history from open data (global price x official FX).
import { perGram, withIndianAdjustment, round2, GOLD_PURITIES } from "../../site/js/lib/pricing.js";

/** Parse a "Date,Open,High,Low,Close[,Volume]" CSV (Stooq format). Throws on anything that is not a CSV of prices. */
export function parseOhlcCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const head = (lines.shift() || "").toLowerCase().split(",").map((s) => s.trim());
  const idx = Object.fromEntries(["date", "open", "high", "low", "close"].map((k) => [k, head.indexOf(k)]));
  if (Object.values(idx).some((i) => i < 0)) throw new Error("not an OHLC CSV (header: " + head.join(",").slice(0, 80) + ")");
  const rows = [];
  for (const line of lines) {
    const c = line.split(","); const day = c[idx.date];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const r = { day, open: +c[idx.open], high: +c[idx.high], low: +c[idx.low], close: +c[idx.close] };
    if ([r.open, r.high, r.low, r.close].every((x) => x > 0)) rows.push(r);
  }
  if (!rows.length) throw new Error("CSV had no usable rows");
  return rows.sort((a, b) => a.day.localeCompare(b.day));
}

/** Frankfurter response -> sorted [{day, rate}]. */
export function parseFx(json) {
  const out = Object.entries(json?.rates || {}).map(([day, v]) => ({ day, rate: Number(v.INR) })).filter((x) => x.rate > 0);
  if (!out.length) throw new Error("FX response had no rates");
  return out.sort((a, b) => a.day.localeCompare(b.day));
}

const fxAt = (fx, day) => { let lo = 0, hi = fx.length - 1, ans = null; while (lo <= hi) { const m = (lo + hi) >> 1; if (fx[m].day <= day) { ans = fx[m]; lo = m + 1; } else hi = m - 1; } return ans; };

/** Build daily_prices rows (INR/gram, estimated Indian rate) for every purity. */
export function buildDaily(metal, usdRows, fx, adjPct, source) {
  const purities = metal === "gold" ? GOLD_PURITIES : [999];
  const out = [];
  for (const r of usdRows) {
    const f = fxAt(fx, r.day); if (!f) continue;                      // weekends/holidays use the last published rate
    for (const p of purities) {
      const g = (usd) => round2(withIndianAdjustment(perGram(usd * f.rate, metal, p), adjPct));
      const o = g(r.open), h = g(r.high), l = g(r.low), c = g(r.close);
      out.push({ day: r.day, metal, purity: p, open: Math.min(Math.max(o, l), h), high: Math.max(h, o, c), low: Math.min(l, o, c), close: c, change_count: 0, source, is_estimate: true });
    }
  }
  return out;
}

/** Coverage report used to refuse a backfill that does not really give ~3 years. */
export function coverage(rows, minDays) {
  const days = [...new Set(rows.map((r) => r.day))].sort();
  if (!days.length) return { ok: false, spanDays: 0, gaps: [], reason: "no rows" };
  const span = Math.round((new Date(days.at(-1)) - new Date(days[0])) / 864e5);
  const gaps = [];
  for (let i = 1; i < days.length; i++) { const g = Math.round((new Date(days[i]) - new Date(days[i - 1])) / 864e5); if (g > 6) gaps.push({ from: days[i - 1], to: days[i], days: g }); }
  return { ok: span >= minDays && gaps.length === 0, spanDays: span, first: days[0], last: days.at(-1), gaps, reason: span < minDays ? `only ${span} days (need ${minDays})` : gaps.length ? `${gaps.length} gap(s) longer than 6 days` : "" };
}

/** Twelve Data time_series response -> sorted [{day, open, high, low, close}] (USD per troy ounce). */
export function parseTwelveData(json) {
  if (json?.status === "error" || json?.code >= 400) throw new Error(`provider error: ${String(json?.message || json?.code).slice(0, 160)}`);
  const rows = [];
  for (const v of json?.values || []) {
    const day = String(v.datetime || "").slice(0, 10), r = { day, open: +v.open, high: +v.high, low: +v.low, close: +v.close };
    if (/^\d{4}-\d{2}-\d{2}$/.test(day) && [r.open, r.high, r.low, r.close].every((x) => x > 0) && r.low <= r.high) rows.push(r);
  }
  if (!rows.length) throw new Error("no usable rows in provider response");
  return rows.sort((a, b) => a.day.localeCompare(b.day));
}

/** Plausible USD per troy ounce. Anything outside means a unit or symbol mix-up, so the data is rejected. */
export const USD_OZ_BOUNDS = { gold: [300, 20000], silver: [3, 500] };
export function usdSane(metal, rows) {
  const [lo, hi] = USD_OZ_BOUNDS[metal];
  return rows.every((r) => r.close >= lo && r.close <= hi && r.low >= lo * 0.8 && r.high <= hi * 1.2);
}

const SYMBOL = { gold: "XAU/USD", silver: "XAG/USD" };
const hideKey = (m) => String(m).replace(/([?&]apikey=)[^&\s]+/gi, "$1***");
/**
 * Load daily USD/oz history from the first source that works AND covers the required period.
 * deps: { getText(url, headers) -> string, env, start 'YYYY-MM-DD', end 'YYYY-MM-DD', minDays }.
 * Error messages never contain the API key.
 */
export async function loadUsdHistory(metal, { getText, env = process.env, start, end, minDays }) {
  const tried = [], sources = [];
  if (env.TWELVEDATA_API_KEY) sources.push({
    name: `twelvedata ${SYMBOL[metal]}`, label: `twelvedata ${SYMBOL[metal]} + ecb (estimate)`,
    url: `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(SYMBOL[metal])}&interval=1day&start_date=${start}&end_date=${end}&outputsize=5000&order=ASC&apikey=${encodeURIComponent(env.TWELVEDATA_API_KEY)}`,
    parse: parseTwelveData,
  });
  else tried.push("twelvedata: the TWELVEDATA_API_KEY secret is not set");
  for (const src of sources) {
    try {
      const rows = src.parse(JSON.parse(await getText(src.url, {})));
      if (!usdSane(metal, rows)) throw new Error(`prices outside the plausible range for ${metal}`);
      const cov = coverage(rows, minDays);
      if (!cov.ok) throw new Error(`coverage problem: ${cov.reason}`);
      return { rows, label: src.label };
    } catch (e) {
      let msg = hideKey(e.message);
      if (env.TWELVEDATA_API_KEY) msg = msg.split(env.TWELVEDATA_API_KEY).join("***");   // providers sometimes echo the key back
      tried.push(`${src.name}: ${msg}`);
    }
  }
  throw new Error(`no ${metal} history source worked. ${tried.join(" | ")}`);
}

/** Readable error for a non-2xx provider reply: keeps the provider's own explanation (e.g. "symbol not found", "plan does not include..."). */
export function httpErrorMessage(status, bodyText) {
  let msg = "";
  try { const j = JSON.parse(bodyText); msg = j.message || j.error || ""; } catch { msg = String(bodyText || "").replace(/\s+/g, " ").slice(0, 160); }
  return `HTTP ${status}${msg ? `: ${String(msg).slice(0, 220)}` : ""}`;
}
