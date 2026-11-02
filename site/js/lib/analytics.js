// Pure analytics: volatility, forecast range, buying-conditions meter, sell-target meter.
// None of this is financial advice; the UI says so and shows every input.

export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
export const sma = (a, n) => (a.length >= n ? mean(a.slice(-n)) : null);
export function stdev(a) { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); }
export function logReturns(closes) { const r = []; for (let i = 1; i < closes.length; i++) if (closes[i - 1] > 0 && closes[i] > 0) r.push(Math.log(closes[i] / closes[i - 1])); return r; }
/** Percentile rank (0..1) of `x` within `a`. */
export const percentileRank = (a, x) => a.filter((v) => v <= x).length / a.length;

/**
 * Forecast range for horizons 1..3 days from daily closes (oldest -> newest).
 * Baseline = ~80% interval from recent daily volatility. The news `bias` (-1..1, from Claude) can only
 * nudge the centre by up to 0.5 sigma per day, so an AI opinion can never push the range far from the data.
 */
export function forecastRange(closes, bias = 0, horizons = [1, 2, 3]) {
  if (closes.length < 31) return null;
  const last = closes.at(-1), sigma = stdev(logReturns(closes.slice(-61)));
  const b = clamp(Number.isFinite(bias) ? bias : 0, -1, 1);
  return horizons.map((h) => {
    const centre = last * Math.exp(b * 0.5 * sigma * h);
    const w = 1.2816 * sigma * Math.sqrt(h); // z for 80% two-sided
    return { horizon: h, low: centre * Math.exp(-w), center: centre, high: centre * Math.exp(w), sigmaPct: sigma * 100 };
  });
}

/**
 * "Buying conditions" meter 0..100 (higher = better value to buy now).
 * closes: daily closes oldest -> newest, ideally >= 200 values.
 */
export function buyMeter(closes) {
  if (closes.length < 60) return null;
  const last = closes.at(-1), year = closes.slice(-365);
  const pct = percentileRank(year, last);                       // 0 = cheapest in a year
  const sma200 = sma(closes, Math.min(200, closes.length)), sma20 = sma(closes, 20);
  const value = 100 * (1 - pct);
  const trend = clamp(50 - (last / sma200 - 1) * 250, 0, 100);  // far above long average -> lower
  const stretch = clamp(50 - (last / sma20 - 1) * 500, 0, 100); // spiking above 20-day -> lower
  const score = Math.round(0.45 * value + 0.35 * trend + 0.2 * stretch);
  const label = score >= 65 ? "Favourable: good time to accumulate" : score >= 40 ? "Neutral: buy in small steps" : "Expensive: consider waiting";
  return {
    score, label,
    parts: [
      { name: "Price vs last 12 months", value: Math.round(value), note: `cheaper than ${Math.round((1 - pct) * 100)}% of the past year` },
      { name: "Price vs 200-day average", value: Math.round(trend), note: `${((last / sma200 - 1) * 100).toFixed(1)}% vs average` },
      { name: "Short-term stretch (20-day)", value: Math.round(stretch), note: `${((last / sma20 - 1) * 100).toFixed(1)}% vs 20-day average` },
    ],
  };
}

export const SELL_TARGET_PCT = 50;
/** Hold/sell guidance for one purchase from its gain %. Target is the owner's rule: sell at +50% over cost. */
export function sellMeter(gainPct, target = SELL_TARGET_PCT) {
  const progress = clamp((gainPct / target) * 100, 0, 100);
  let zone, label;
  if (gainPct >= target) { zone = "sell"; label = "Target reached: consider selling"; }
  else if (gainPct >= target * 0.8) { zone = "near"; label = "Close to target: watch closely"; }
  else if (gainPct >= 0) { zone = "hold"; label = "Hold: below target"; }
  else { zone = "below"; label = "Below your cost: hold, don't sell at a loss"; }
  return { progress: Math.round(progress), zone, label };
}
