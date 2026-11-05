// Unit conversion + data-quality rules shared by the site, the ingest scripts and the tests.
// Everything here is pure (no I/O) so it can be unit tested.

export const GRAMS_PER_TROY_OZ = 31.1034768;
export const FINENESS = { gold: { 24: 0.999, 22: 0.916, 18: 0.75 }, silver: { 999: 0.999, 925: 0.925 } };
export const GOLD_PURITIES = [24, 22, 18];

/** Spot price per troy ounce (any currency) -> price per gram of the given purity. */
export function perGram(pricePerOz, metal, purity) {
  const f = FINENESS[metal]?.[purity];
  if (!f || !(pricePerOz > 0)) throw new Error(`bad input: ${metal} ${purity} ${pricePerOz}`);
  // Spot quotes are for ~pure (.999) metal, so scale by purity relative to .999.
  return (pricePerOz / GRAMS_PER_TROY_OZ) * (f / FINENESS[metal][metal === "gold" ? 24 : 999]);
}

/** International spot converted to an *estimated* Indian rate by applying import duty (+ optional premium), in %. */
export const withIndianAdjustment = (price, adjPct) => price * (1 + adjPct / 100);
export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Plausible INR/gram bounds. A reading outside is treated as a data error, never displayed. */
export const SANE = { gold: { 24: [2000, 60000] }, silver: { 999: [20, 1500] } };

/**
 * Validate a candidate tick set against rules that catch bad data.
 * ticks: [{metal,purity,price}] for ONE observation time. last: previous accepted ticks (same shape) or [].
 * Returns { ok, problems[] }.
 */
export function validateTicks(ticks, last = [], { maxJumpPct = 8 } = {}) {
  const problems = [];
  const by = (arr, m, p) => arr.find((t) => t.metal === m && t.purity === p);
  for (const t of ticks) {
    if (!Number.isFinite(t.price) || t.price <= 0) problems.push(`${t.metal} ${t.purity}: not a positive number`);
    const bounds = SANE[t.metal]?.[t.metal === "gold" ? 24 : 999];
    const base = t.metal === "gold" ? t.price / (FINENESS.gold[t.purity] / FINENESS.gold[24]) : t.price / (FINENESS.silver[t.purity] / FINENESS.silver[999]);
    if (bounds && (base < bounds[0] || base > bounds[1])) problems.push(`${t.metal} ${t.purity}: ${t.price} outside sane range`);
    const prev = by(last, t.metal, t.purity);
    if (prev && Math.abs(t.price / prev.price - 1) * 100 > maxJumpPct) problems.push(`${t.metal} ${t.purity}: jump >${maxJumpPct}% vs last accepted`);
  }
  // Gold purities must be consistent with each other (22k ~ 24k x 0.916/0.999 etc.).
  const g24 = by(ticks, "gold", 24);
  if (g24) for (const p of [22, 18]) {
    const t = by(ticks, "gold", p);
    if (t) { const exp = g24.price * (FINENESS.gold[p] / FINENESS.gold[24]); if (Math.abs(t.price / exp - 1) > 0.015) problems.push(`gold ${p}k inconsistent with 24k`); }
  }
  return { ok: problems.length === 0, problems };
}

const IST_MS = 330 * 60000;
const istMidnight = (ms) => Math.floor((ms + IST_MS) / 864e5) * 864e5 - IST_MS;
const slotsOn = (dayStartMs, schedule) => (schedule.days.includes(new Date(dayStartMs + IST_MS).getUTCDay()) ? schedule.times.map((t) => { const [h, m] = t.split(":").map(Number); return dayStartMs + (h * 60 + m) * 60000; }).sort((a, b) => a - b) : []);

/** Most recent scheduled refresh at or before `now` (epoch ms), or null. Schedule = { days, times (IST HH:MM), graceMinutes }. */
export function lastScheduledRun(now, schedule) {
  const t = new Date(now).getTime(), today = istMidnight(t);
  for (let back = 0; back <= 8; back++) { const hit = slotsOn(today - back * 864e5, schedule).filter((x) => x <= t); if (hit.length) return hit.at(-1); }
  return null;
}
/** Next scheduled refresh after `now` (epoch ms), or null. */
export function nextScheduledRun(now, schedule) {
  const t = new Date(now).getTime(), today = istMidnight(t);
  for (let ahead = 0; ahead <= 8; ahead++) { const hit = slotsOn(today + ahead * 864e5, schedule).filter((x) => x > t); if (hit.length) return hit[0]; }
  return null;
}

/**
 * Is the displayed price too old to call "current"?
 * With a schedule: stale only if some scheduled slot older than `graceMinutes` was never covered by a successful check.
 * (GitHub's free scheduler can run jobs hours late or skip them, so the grace period is generous; nights, Sundays and the
 * gaps between runs are never warned about.) Without a schedule: older than 3 hours.
 */
export function staleness(lastCheckedIso, now = new Date(), schedule = null) {
  if (!lastCheckedIso) return { stale: true, hours: Infinity };
  const last = Date.parse(lastCheckedIso), t = new Date(now).getTime(), hours = (t - last) / 36e5;
  if (!schedule) return { stale: hours > 3, hours };
  const slot = lastScheduledRun(t - schedule.graceMinutes * 60000, schedule);   // newest slot that is already "old enough" to expect data
  return { stale: slot != null && last < slot - 10 * 60000, hours };
}

/** IST calendar day (YYYY-MM-DD) for a Date/ISO string. */
export function istDay(d) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(d));
  return p;
}
