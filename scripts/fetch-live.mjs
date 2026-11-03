#!/usr/bin/env node
// Live price job (runs every ~15 min on GitHub Actions). Records a row ONLY when a price actually changes,
// so price_ticks is the exact log of "what changed, and when". Never writes data that fails validation.
//   node scripts/fetch-live.mjs [--dry-run] [--mock file.json]
import { readFileSync } from "node:fs";
import { loadPricing, loadSchedule, safeFetch } from "./lib/common.mjs";
import { db } from "./lib/db.mjs";
import { USAGE_SOURCE, requestsPerRun, monthKey, parseUsage, usageNote, canSpend, monthlyLimit } from "./lib/quota.mjs";
import { perGram, withIndianAdjustment, round2, validateTicks, istDay, GOLD_PURITIES } from "../site/js/lib/pricing.js";

const args = process.argv.slice(2), DRY = args.includes("--dry-run"), mockAt = args.indexOf("--mock");
const SOURCE = "goldapi.io";

/** Parse a GoldAPI.io response ({price: INR per troy oz, timestamp: unix seconds}). */
export function parseGoldApi(json) {
  const price = Number(json?.price), ts = Number(json?.timestamp);
  if (!(price > 0) || !(ts > 1e9)) throw new Error("unexpected provider response shape");
  return { pricePerOz: price, observedAt: new Date(ts * 1000).toISOString() };
}

/** Turn two provider quotes into estimated-Indian tick candidates. */
export function buildTicks({ gold, silver }, pricing) {
  const adj = (m) => (pricing[m].import_duty_pct || 0) + (pricing[m].local_premium_pct || 0);
  const out = [];
  if (gold) for (const p of GOLD_PURITIES) { const raw = perGram(gold.pricePerOz, "gold", p); out.push({ metal: "gold", purity: p, raw, adj: adj("gold"), price: round2(withIndianAdjustment(raw, adj("gold"))), observedAt: gold.observedAt }); }
  if (silver) { const raw = perGram(silver.pricePerOz, "silver", 999); out.push({ metal: "silver", purity: 999, raw, adj: adj("silver"), price: round2(withIndianAdjustment(raw, adj("silver"))), observedAt: silver.observedAt }); }
  return out;
}

async function quote(sym, token) {
  const res = await safeFetch(`https://www.goldapi.io/api/${sym}/INR`, { headers: { "x-access-token": token, "Content-Type": "application/json" } });
  if (!res.ok) throw new Error(`${sym}: HTTP ${res.status}`);
  return parseGoldApi(await res.json());
}

async function main() {
  const pricing = loadPricing(), metals = loadSchedule().metals, cost = requestsPerRun(metals);
  let quotes;
  if (mockAt >= 0) quotes = JSON.parse(readFileSync(args[mockAt + 1], "utf8"));
  else {
    if (!process.env.GOLDAPI_KEY) throw new Error("GOLDAPI_KEY is not set");
    if (!DRY) {
      // Budget guard: count the requests BEFORE spending them (a failed call still uses quota).
      const d0 = db(), key = monthKey(), limit = monthlyLimit();
      const row = (await d0.select("ingest_status", `select=note&source=eq.${encodeURIComponent(USAGE_SOURCE)}`))[0];
      const used = parseUsage(row?.note, key);
      if (!canSpend(used, cost, limit)) {
        console.log(`::warning::Monthly request budget reached (${used}/${limit}). Skipping this run to protect your plan. Prices will show as out of date until next month or until you raise GOLDAPI_MONTHLY_LIMIT.`);
        return;
      }
      await d0.upsert("ingest_status", [{ source: USAGE_SOURCE, last_checked: new Date().toISOString(), last_ok: true, note: usageNote(key, used + cost) }], "source");
      console.log(`request budget: ${used + cost}/${limit} used this month (after this run; fetching: ${metals.join(", ")})`);
    }
    quotes = {};
    if (metals.includes("gold")) quotes.gold = await quote("XAU", process.env.GOLDAPI_KEY);
    if (metals.includes("silver")) quotes.silver = await quote("XAG", process.env.GOLDAPI_KEY);
  }
  const ticks = buildTicks(quotes, pricing);
  if (!ticks.length) throw new Error("nothing to fetch: check \"metals\" in site/data/schedule.json");
  if (DRY) return console.log(JSON.stringify(ticks, null, 1));

  const d = db(), now = new Date().toISOString();
  const lastRows = await d.select("price_ticks", "select=metal,purity,price_per_gram,observed_at&order=observed_at.desc&limit=40");
  const last = [];
  for (const r of lastRows) if (!last.some((x) => x.metal === r.metal && x.purity === r.purity)) last.push({ metal: r.metal, purity: r.purity, price: Number(r.price_per_gram) });

  const check = validateTicks(ticks.map((t) => ({ metal: t.metal, purity: t.purity, price: t.price })), last);
  if (!check.ok) {
    await d.upsert("ingest_status", [{ source: SOURCE, last_checked: now, last_ok: false, note: check.problems.join("; ").slice(0, 300) }], "source");
    throw new Error("rejected by validation: " + check.problems.join("; "));
  }
  const changed = ticks.filter((t) => { const l = last.find((x) => x.metal === t.metal && x.purity === t.purity); return !l || Math.abs(l.price - t.price) >= 0.01; });
  if (changed.length)
    await d.upsert("price_ticks", changed.map((t) => ({ metal: t.metal, purity: t.purity, price_per_gram: t.price, raw_per_gram: round2(t.raw), adj_pct: t.adj, source: SOURCE, observed_at: t.observedAt })), "metal,purity,source,observed_at", { ignoreDuplicates: true });
  await d.upsert("ingest_status", [{ source: SOURCE, last_checked: now, last_ok: true, note: changed.length ? `${changed.length} price change(s) recorded` : "no change" }], "source");

  // Rebuild today's (IST) daily row from the ticks so the chart's latest point is always live.
  const today = istDay(now);
  const from = new Date(`${today}T00:00:00+05:30`).toISOString();
  const rows = await d.select("price_ticks", `select=metal,purity,price_per_gram,observed_at&observed_at=gte.${from}&order=observed_at.asc`);
  const groups = new Map();
  for (const r of rows) { const k = `${r.metal}|${r.purity}`; (groups.get(k) || groups.set(k, []).get(k)).push(Number(r.price_per_gram)); }
  const daily = [...groups].map(([k, v]) => { const [metal, purity] = k.split("|"); return { day: today, metal, purity: Number(purity), open: v[0], high: Math.max(...v), low: Math.min(...v), close: v.at(-1), change_count: v.length, source: SOURCE, is_estimate: true }; });
  if (daily.length) await d.upsert("daily_prices", daily, "day,metal,purity");
  console.log(`checked ok; ${changed.length} changed; ${daily.length} daily rows refreshed`);
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error("live update failed:", e.message); process.exit(1); });
