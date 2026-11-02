#!/usr/bin/env node
// Fails (exit 1) if any shipped content breaks the rules. Run in CI, in the daily job and from the Claude Code hook.
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { DATA_DIR, loadAllowlist, isAllowedUrl, sanitizeNewsItem, TRACKS } from "./lib/content.mjs";

const errors = [];
const list = loadAllowlist();
const load = (f) => { try { return JSON.parse(readFileSync(path.join(DATA_DIR, f), "utf8")); } catch (e) { errors.push(`${f}: ${e.message}`); return null; } };
if (list.allowed.length > 64) errors.push("allowlist > 64 domains");

const cur = load("curriculum.json");
if (cur) {
  const ids = new Set();
  for (const t of cur.tracks) if (!TRACKS.includes(t.id)) errors.push(`unknown track ${t.id}`);
  for (const l of cur.lessons) {
    if (ids.has(l.id)) errors.push(`duplicate lesson id ${l.id}`);
    ids.add(l.id);
    if (!cur.tracks.some((t) => t.id === l.track)) errors.push(`${l.id}: bad track`);
    if (![1, 2, 3].includes(l.level)) errors.push(`${l.id}: bad level`);
    if (!l.points?.length) errors.push(`${l.id}: no key points`);
    if (!l.quiz || l.quiz.options?.length < 2 || !(l.quiz.answer >= 0 && l.quiz.answer < l.quiz.options.length)) errors.push(`${l.id}: bad quiz`);
    for (const r of l.resources ?? []) if (!isAllowedUrl(r.url, list)) errors.push(`${l.id}: resource not allowed ${r.url}`);
  }
}
const news = existsSync(path.join(DATA_DIR, "news.json")) ? load("news.json") : null;
if (news) for (const i of news.items) { try { sanitizeNewsItem(i, list); } catch (e) { errors.push(`news ${i.id}: ${e.message}`); } }
const res = load("resources.json");
if (res) for (const r of res.resources) if (!isAllowedUrl(r.url, list)) errors.push(`resource not allowed ${r.url}`);

if (errors.length) { console.error("Content validation FAILED:\n - " + errors.join("\n - ")); process.exit(1); }
console.log(`Content OK (${cur?.lessons.length ?? 0} lessons, ${news?.items.length ?? 0} news, ${res?.resources.length ?? 0} resources)`);
