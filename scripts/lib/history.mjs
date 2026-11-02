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
