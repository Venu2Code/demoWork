// Request budget guard for the price provider's monthly limit (GoldAPI plan: 300 requests/month).
// The running count is kept in the existing ingest_status table (row source = "goldapi.io:usage").
export const USAGE_SOURCE = "goldapi.io:usage";
/** One provider request per metal fetched in a run. */
export const requestsPerRun = (metals) => Math.max(1, metals.length);
export const monthKey = (d = new Date()) => new Date(d).toISOString().slice(0, 7);
export function parseUsage(note, key) { try { const j = JSON.parse(note || ""); return j.month === key ? Math.max(0, Number(j.count) || 0) : 0; } catch { return 0; } }
export const usageNote = (key, count) => JSON.stringify({ month: key, count });
export const canSpend = (used, cost, limit) => used + cost <= limit;
/** Default 250 of 300 leaves headroom for manual test runs and calls made before the counter existed. */
export const monthlyLimit = (env = process.env) => { const n = Number(env.GOLDAPI_MONTHLY_LIMIT); return Number.isFinite(n) && n > 0 ? n : 250; };
