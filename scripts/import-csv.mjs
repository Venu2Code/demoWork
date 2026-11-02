#!/usr/bin/env node
// Import your own history when open-data sources are unavailable (or to correct values).
//   node scripts/import-csv.mjs <file.csv> <gold|silver> <usd-oz|inr-gram-24k|inr-gram> [--dry-run]
// CSV header: Date,Open,High,Low,Close   (Date as YYYY-MM-DD)
//   usd-oz        values are USD per troy ounce -> needs the FX file too: set FX_CSV=fx.csv (Date,Close = USD/INR)
//   inr-gram-24k  values are already INR per gram of 24k gold (final, no adjustment applied)
//   inr-gram      INR per gram for silver (999), final
import { readFileSync } from "node:fs";
import { loadPricing } from "./lib/common.mjs";
import { db } from "./lib/db.mjs";
import { parseOhlcCsv, buildDaily, coverage } from "./lib/history.mjs";
import { FINENESS, GOLD_PURITIES, round2 } from "../site/js/lib/pricing.js";

const [file, metal, unit] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const DRY = process.argv.includes("--dry-run");
if (!file || !["gold", "silver"].includes(metal) || !["usd-oz", "inr-gram-24k", "inr-gram"].includes(unit)) { console.error("usage: import-csv.mjs <file> <gold|silver> <usd-oz|inr-gram-24k|inr-gram>"); process.exit(1); }
const rows = parseOhlcCsv(readFileSync(file, "utf8"));
let out;
if (unit === "usd-oz") {
  if (!process.env.FX_CSV) throw new Error("set FX_CSV=path to a Date,Open,High,Low,Close CSV of USD/INR");
  const fx = parseOhlcCsv(readFileSync(process.env.FX_CSV, "utf8")).map((r) => ({ day: r.day, rate: r.close }));
  const p = loadPricing(); out = buildDaily(metal, rows, fx, (p[metal].import_duty_pct || 0) + (p[metal].local_premium_pct || 0), "csv-import (estimate)");
} else {
  const purities = metal === "gold" ? GOLD_PURITIES : [999];
  out = rows.flatMap((r) => purities.map((p) => { const k = metal === "gold" ? FINENESS.gold[p] / FINENESS.gold[24] : 1; return { day: r.day, metal, purity: p, open: round2(r.open * k), high: round2(r.high * k), low: round2(r.low * k), close: round2(r.close * k), change_count: 0, source: "csv-import", is_estimate: false }; }));
}
const cov = coverage(out.filter((r) => r.purity === (metal === "gold" ? 24 : 999)), 1);
console.log(`${out.length} rows, ${cov.first}..${cov.last}, gaps: ${cov.gaps.length}`);
if (!DRY) { await db().upsert("daily_prices", out, "day,metal,purity"); console.log("written"); }
