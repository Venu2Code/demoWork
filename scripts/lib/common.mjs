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

/**
 * fetch with timeout + one retry on 5xx/network errors; only allowlisted hosts.
 * Redirects are followed by hand (max 3) and EVERY hop must be on the allowlist, so a trusted host can never
 * bounce a job to an untrusted one. Options: { retryDelayMs } (tests use 0).
 */
export async function safeFetch(url, opts = {}, list = loadAllowlist(), { maxRedirects = 3, retryDelayMs = 1500 } = {}) {
  let current = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (!isAllowedUrl(current, list)) throw new Error(`refusing to fetch non-allowlisted URL: ${redact(current)}`);
    let res, lastErr;
    for (let i = 0; i < 2 && !res; i++) {
      try {
        res = await fetch(current, { ...opts, redirect: "manual", signal: AbortSignal.timeout(25000) });
        if (res.status >= 500) { const s = res.status; res = undefined; throw new Error(`HTTP ${s}`); }
      } catch (e) { lastErr = e; if (retryDelayMs) await sleep(retryDelayMs); }
    }
    if (!res) throw new Error(redact(lastErr?.message || lastErr));   // network errors can embed the URL, so never rethrow them raw
    const where = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!where) return res;
    try { current = new URL(where, current).href; } catch { throw new Error("redirect to an invalid address"); }
  }
  throw new Error("too many redirects");
}

/** Read a response body as text, refusing anything larger than `max` bytes (protects job memory from huge or hostile responses). */
export async function readLimited(res, max = 3_000_000) {
  const declared = Number(res.headers.get("content-length"));
  if (declared > max) throw new Error("response too large");
  const reader = res.body.getReader(), chunks = []; let n = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    n += value.length; if (n > max) { await reader.cancel(); throw new Error("response too large"); }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
