// Purchase-lot maths. Cost always includes GST, making and other charges (what the user really paid).
import { FINENESS } from "./pricing.js";
import { sellMeter, SELL_TARGET_PCT } from "./analytics.js";

/** latest: { gold:{24,22,18}, silver:{999} } current INR/gram. Returns the rate for a purchase's metal/purity or null. */
export function rateFor(latest, metal, purity) {
  const m = latest?.[metal]; if (!m) return null;
  if (m[purity] > 0) return m[purity];
  const base = metal === "gold" ? m[24] : m[999];                      // derive a missing purity from the pure rate
  const f = FINENESS[metal]?.[purity];
  return base > 0 && f ? base * (f / FINENESS[metal][metal === "gold" ? 24 : 999]) : null;
}

export function evaluateLot(p, latest, target = SELL_TARGET_PCT) {
  const rate = rateFor(latest, p.metal, p.purity), grams = Number(p.grams), cost = Number(p.total_paid);
  if (!(grams > 0) || !(cost > 0)) return { ...p, error: "invalid purchase" };
  if (!rate) return { ...p, error: "no current rate for this purity" };
  const value = grams * rate, profit = value - cost, gainPct = (profit / cost) * 100;
  return { ...p, rate, value, profit, gainPct, costPerGram: cost / grams, sell: sellMeter(gainPct, target) };
}

export function summarize(purchases, latest, target = SELL_TARGET_PCT) {
  const lots = purchases.map((p) => evaluateLot(p, latest, target));
  const ok = lots.filter((l) => !l.error);
  const cost = ok.reduce((s, l) => s + Number(l.total_paid), 0), value = ok.reduce((s, l) => s + l.value, 0);
  const grams = { gold: 0, silver: 0 };
  for (const l of ok) grams[l.metal] += Number(l.grams);
  return { lots, grams, cost, value, profit: value - cost, gainPct: cost ? ((value - cost) / cost) * 100 : 0, skipped: lots.length - ok.length, sellNow: ok.filter((l) => l.sell.zone === "sell") };
}

/** Strict validation for the purchase form (also mirrored by DB check constraints). Returns {ok, errors, value}. */
export function validatePurchase(f, today = new Date().toISOString().slice(0, 10)) {
  const errors = [], v = {};
  v.metal = f.metal; if (!["gold", "silver"].includes(v.metal)) errors.push("Choose gold or silver.");
  v.purity = Number(f.purity); if (!FINENESS[v.metal]?.[v.purity]) errors.push("Choose a valid purity.");
  v.grams = Number(f.grams); if (!(v.grams > 0 && v.grams <= 100000)) errors.push("Grams must be a positive number.");
  v.total_paid = Number(f.total_paid); if (!(v.total_paid > 0 && v.total_paid < 1e9)) errors.push("Total paid (including GST and charges) must be positive.");
  v.purchased_on = f.purchased_on; if (!/^\d{4}-\d{2}-\d{2}$/.test(v.purchased_on || "") || v.purchased_on > today || v.purchased_on < "2000-01-01") errors.push("Purchase date must be a real date, not in the future.");
  v.form = ["coin", "bar", "jewellery", "digital", "other"].includes(f.form) ? f.form : "other";
  for (const k of ["gst_amount", "making_charges", "other_charges"]) { v[k] = f[k] === "" || f[k] == null ? 0 : Number(f[k]); if (!(v[k] >= 0)) errors.push(`${k.replace("_", " ")} cannot be negative.`); }
  if (v.gst_amount + v.making_charges + v.other_charges > v.total_paid) errors.push("GST + charges cannot exceed the total paid.");
  v.notes = String(f.notes || "").slice(0, 300);
  return { ok: errors.length === 0, errors, value: v };
}
