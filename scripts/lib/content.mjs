// Shared content rules: domain allowlist + strict validation/sanitising of AI-curated items.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "..", "..");
export const DATA_DIR = path.join(ROOT, "site", "data");

export const CATEGORIES = ["hardware", "programming", "networking", "ai", "cloud", "security", "industry"];
export const TRACKS = ["hardware", "programming", "networking", "ai", "cloud"];

export function loadAllowlist() {
  return JSON.parse(readFileSync(path.join(DATA_DIR, "allowed-domains.json"), "utf8"));
}

const matches = (host, domain) => host === domain || host.endsWith("." + domain);

/** True only for https URLs on an allowlisted host (and not on the blocklist). No credentials, no odd ports. */
export function isAllowedUrl(raw, list = loadAllowlist()) {
  let u;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return false;
  const host = u.hostname.toLowerCase();
  if (list.blocked.some((d) => matches(host, d))) return false;
  return list.allowed.some((d) => matches(host, d));
}

const CTRL = /[\u0000-\u001f\u007f<>]/g;
export const clean = (s, max) => String(s ?? "").replace(CTRL, " ").replace(/\s+/g, " ").trim().slice(0, max);
const INJECTION = /(ignore (all|previous|prior)|system prompt|api[_ -]?key|<script|javascript:|data:text)/i;

export const itemId = (url) => createHash("sha256").update(url.split("#")[0]).digest("hex").slice(0, 12);

/** Returns a sanitised item or throws Error(reason). */
export function sanitizeNewsItem(raw, list = loadAllowlist()) {
  if (!raw || typeof raw !== "object") throw new Error("not an object");
  const url = String(raw.url ?? "").trim();
  if (!isAllowedUrl(url, list)) throw new Error(`url not allowed: ${url.slice(0, 80)}`);
  const title = clean(raw.title, 140);
  const summary = clean(raw.summary, 400);
  const why = clean(raw.why_it_matters, 240);
  if (title.length < 8 || summary.length < 20) throw new Error("title/summary too short");
  if ([title, summary, why].some((t) => INJECTION.test(t))) throw new Error("suspicious text");
  const category = String(raw.category ?? "").toLowerCase();
  if (!CATEGORIES.includes(category)) throw new Error(`bad category: ${category}`);
  const published = /^\d{4}-\d{2}-\d{2}$/.test(raw.published ?? "") ? raw.published : null;
  const tags = (Array.isArray(raw.tags) ? raw.tags : []).slice(0, 5).map((t) => clean(t, 24).toLowerCase()).filter(Boolean);
  const level = ["beginner", "intermediate", "advanced"].includes(raw.level) ? raw.level : "intermediate";
  return { id: itemId(url), title, summary, why_it_matters: why, url, source: new URL(url).hostname.replace(/^www\./, ""), category, level, tags, published };
}

export function sanitizeTrending(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 6).map((t) => ({
    topic: clean(t?.topic, 60),
    why: clean(t?.why, 200),
    track: TRACKS.includes(t?.track) ? t.track : "ai",
  })).filter((t) => t.topic.length > 2 && !INJECTION.test(t.topic + t.why));
}
