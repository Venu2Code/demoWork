import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const loadAllowlist = () => JSON.parse(readFileSync(path.join(ROOT, "site", "data", "allowed-domains.json"), "utf8"));
export const loadSchedule = () => JSON.parse(readFileSync(path.join(ROOT, "site", "data", "schedule.json"), "utf8"));
export const loadPricing = () => JSON.parse(readFileSync(path.join(ROOT, "config", "pricing.json"), "utf8"));

const matches = (host, d) => host === d || host.endsWith("." + d);
/** https only, no credentials/odd ports, host on allowlist and not on blocklist. */
export function isAllowedUrl(raw, list = loadAllowlist()) {
  let u; try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return false;
  const h = u.hostname.toLowerCase();
  return !list.blocked.some((d) => matches(h, d)) && list.allowed.some((d) => matches(h, d));
}
export const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
export const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Hide API keys/tokens that appear in URLs before text reaches logs or error messages. */
export const redact = (text) => String(text).replace(/([?&](?:apikey|api_key|key|token|access_token)=)[^&\s]+/gi, "$1***");

/** fetch with timeout + one retry on 5xx/network errors; only allowlisted hosts. */
export async function safeFetch(url, opts = {}, list = loadAllowlist()) {
  if (!isAllowedUrl(url, list)) throw new Error(`refusing to fetch non-allowlisted URL: ${redact(url)}`);
  let lastErr;
  for (let i = 0; i < 2; i++) {
    try {
      const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(25000) });
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (e) { lastErr = e; await sleep(1500); }
  }
  throw new Error(redact(lastErr?.message || lastErr));   // network errors can embed the URL, so never rethrow them raw
}
