#!/usr/bin/env node
// One-off (re-runnable) backfill of ~3 years of daily INR/gram history from open data:
//   global gold/silver USD per oz (Stooq) x USD->INR (ECB reference rates via Frankfurter) x Indian duty adjustment.
// These rows are ESTIMATES and are flagged is_estimate=true in the DB and in the UI.
// If the sources are unreachable, use scripts/import-csv.mjs with your own file instead.
//   node scripts/backfill-history.mjs [--dry-run]
import { loadPricing, safeFetch } from "./lib/common.mjs";
import { db } from "./lib/db.mjs";
import { parseOhlcCsv, parseFx, buildDaily, coverage } from "./lib/history.mjs";

const DRY = process.argv.includes("--dry-run");
const ymd = (d) => d.toISOString().slice(0, 10);
const compact = (s) => s.replaceAll("-", "");

async function text(url) { const r = await safeFetch(url); if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`); return r.text(); }

async function main() {
  const pricing = loadPricing(), end = new Date(), start = new Date(end - pricing.history_days * 864e5);
  const [s, e] = [ymd(start), ymd(end)];
  const fx = parseFx(JSON.parse(await text(`https://api.frankfurter.dev/v1/${s}..${e}?base=USD&symbols=INR`)));
  const all = [];
  for (const [metal, sym] of [["gold", "xauusd"], ["silver", "xagusd"]]) {
    const usd = parseOhlcCsv(await text(`https://stooq.com/q/d/l/?s=${sym}&i=d&d1=${compact(s)}&d2=${compact(e)}`));
    const adj = (pricing[metal].import_duty_pct || 0) + (pricing[metal].local_premium_pct || 0);
    const rows = buildDaily(metal, usd, fx, adj, "stooq+ecb (estimate)");
    const cov = coverage(rows.filter((r) => r.purity === (metal === "gold" ? 24 : 999)), pricing.min_history_days);
    console.log(`${metal}: ${rows.length} rows, ${cov.first}..${cov.last} (${cov.spanDays} days)`, cov.ok ? "OK" : `PROBLEM: ${cov.reason}`);
    if (!cov.ok) throw new Error(`${metal} history incomplete: ${cov.reason}. Not writing anything.`);
    all.push(...rows);
  }
  if (DRY) return console.log("dry run: nothing written");
  await db().upsert("daily_prices", all, "day,metal,purity");
  console.log(`wrote ${all.length} daily rows`);
}
main().catch((e) => { console.error("backfill failed:", e.message); process.exit(1); });
