#!/usr/bin/env node
// One-off (re-runnable) backfill of ~3 years of daily INR/gram history:
//   global gold/silver USD per oz (Twelve Data; needs the free TWELVEDATA_API_KEY secret)
//   x USD->INR (ECB reference rates via Frankfurter) x Indian duty adjustment.
// Rows are ESTIMATES and are flagged is_estimate=true in the DB and in the UI.
// A metal is written only if it covers the full period with plausible prices. By default both must pass or nothing is written;
// with --allow-partial the metal that passes is saved and the other is reported (as a warning) and skipped.
// If the source is unavailable, use scripts/import-csv.mjs with your own file instead.
//   node scripts/backfill-history.mjs [--dry-run] [--allow-partial]
import { loadPricing, safeFetch, readLimited } from "./lib/common.mjs";
import { db } from "./lib/db.mjs";
import { parseFx, buildDaily, coverage, loadUsdHistory, httpErrorMessage } from "./lib/history.mjs";

const DRY = process.argv.includes("--dry-run");
// With --allow-partial, a metal that cannot be loaded is reported and skipped instead of blocking the other one.
const PARTIAL = process.argv.includes("--allow-partial");
const ymd = (d) => d.toISOString().slice(0, 10);

// Never put the URL in the message: it can contain an API key.
async function text(url, headers = {}) { const r = await safeFetch(url, { headers }); if (!r.ok) throw new Error(httpErrorMessage(r.status, await readLimited(r, 200_000))); return readLimited(r, 5_000_000); }

async function main() {
  const pricing = loadPricing(), end = new Date(), start = new Date(end - pricing.history_days * 864e5);
  const [s, e] = [ymd(start), ymd(end)];
  const fx = parseFx(JSON.parse(await text(`https://api.frankfurter.dev/v1/${s}..${e}?base=USD&symbols=INR`)));
  console.log(`USD/INR: ${fx.length} daily rates, ${fx[0].day}..${fx.at(-1).day}`);
  const all = [], failures = [];
  for (const metal of ["gold", "silver"]) {
    try {
      const { rows: usd, label } = await loadUsdHistory(metal, { getText: text, start: s, end: e, minDays: pricing.min_history_days });
      const adj = (pricing[metal].import_duty_pct || 0) + (pricing[metal].local_premium_pct || 0);
      const rows = buildDaily(metal, usd, fx, adj, label);
      const cov = coverage(rows.filter((r) => r.purity === (metal === "gold" ? 24 : 999)), pricing.min_history_days);
      console.log(`${metal}: ${rows.length} rows from ${label}, ${cov.first}..${cov.last} (${cov.spanDays} days)`, cov.ok ? "OK" : `PROBLEM: ${cov.reason}`);
      if (!cov.ok) throw new Error(`${metal} history incomplete: ${cov.reason}`);
      all.push(...rows);
    } catch (err) {
      if (!PARTIAL) throw err;
      failures.push(`${metal}: ${err.message}`);
      console.log(`::warning::${metal} history was NOT loaded: ${err.message}`);
    }
  }
  if (!all.length) throw new Error(`no history could be loaded. ${failures.join(" | ")}`);
  if (DRY) return console.log("dry run: nothing written");
  await db().upsert("daily_prices", all, "day,metal,purity");
  console.log(`wrote ${all.length} daily rows${failures.length ? `. NOT loaded: ${failures.join(" | ")}` : ""}`);
}
main().catch((e) => { console.error("backfill failed:", e.message); process.exit(1); });
