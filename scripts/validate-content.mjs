#!/usr/bin/env node
// Static checks used by CI and the Claude Code post-edit hook: allowlist sanity + config sanity.
import { loadAllowlist, loadPricing } from "./lib/common.mjs";
const errors = [], l = loadAllowlist(), p = loadPricing();
if (l.news.length > 64) errors.push("news allowlist > 64 domains (API limit)");
for (const d of [...l.news, ...l.data]) if (!l.allowed.includes(d)) errors.push(`${d} is in news/data but missing from allowed`);
for (const d of l.allowed) if (l.blocked.includes(d)) errors.push(`${d} is both allowed and blocked`);
for (const m of ["gold", "silver"]) { const x = p[m]; if (!(x?.import_duty_pct >= 0 && x.import_duty_pct <= 40) || !(x.local_premium_pct >= 0 && x.local_premium_pct <= 20)) errors.push(`pricing.${m} out of range`); }
if (p.min_history_days < 1095) errors.push("min_history_days must be >= 1095 (3 years)");
if (errors.length) { console.error("Validation FAILED:\n - " + errors.join("\n - ")); process.exit(1); }
console.log(`Config OK (${l.news.length} news domains, ${l.data.length} data providers)`);
