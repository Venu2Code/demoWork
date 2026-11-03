// Free news source for the Market watch box: RSS/Atom headlines + a scheduled-release calendar. No AI involved.
// Everything here is pure except collectFeedNews(), which takes an injected fetchText() so it can be tested.

// ---------- small, tolerant XML helpers (feeds are untrusted text: tags are stripped, never rendered) ----------
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', ndash: "-", mdash: "-", hellip: "..." };
export const decodeEntities = (s) => String(s).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
  if (e[0] === "#") { const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x10ffff ? String.fromCodePoint(n) : " "; }
  return ENT[e.toLowerCase()] ?? m;
});
const unCdata = (s) => String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
export const stripTags = (s) => decodeEntities(unCdata(s).replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
const tag = (block, name) => { const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i")); return m ? m[1] : ""; };
const atomLink = (block) => { const m = block.match(/<link\b[^>]*?href=["']([^"']+)["'][^>]*>/i); return m ? decodeEntities(m[1]) : ""; };

/** RSS 2.0 or Atom text -> [{ title, link, summary, publishedMs|null }]. Never throws on odd input. */
export function parseFeed(xml) {
  const text = String(xml || ""), out = [];
  const blocks = [...text.matchAll(/<item\b[\s\S]*?<\/item>/gi), ...text.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((m) => m[0]);
  for (const b of blocks) {
    const title = stripTags(tag(b, "title"));
    let link = stripTags(tag(b, "link")) || atomLink(b) || stripTags(tag(b, "guid"));
    if (/^http:\/\//i.test(link)) link = "https://" + link.slice(7);
    const summary = stripTags(tag(b, "description") || tag(b, "summary") || tag(b, "content:encoded") || tag(b, "content"));
    const when = stripTags(tag(b, "pubDate") || tag(b, "dc:date") || tag(b, "published") || tag(b, "updated"));
    const ms = Date.parse(when);
    if (title && link) out.push({ title, link, summary, publishedMs: Number.isFinite(ms) ? ms : null });
  }
  return out;
}

// ---------- relevance: simple, explainable keyword rules ----------
const RULES = [
  [/\bgold\b|\bbullion\b|safe[- ]haven/i, 5],
  [/central bank gold|gold reserve|world gold council|\bwgc\b|\bmcx\b/i, 3],
  [/federal open market committee|\bfomc\b|monetary policy|policy rate|repo rate|\bmpc\b|rate (cut|hike)|interest rate/i, 4],
  [/customs duty|import duty|bullion duty|\bgst\b|union budget/i, 3],
  [/\binflation\b|consumer price|\bcpi\b|employment situation|nonfarm|payroll|unemployment|\bgdp\b|producer price/i, 2],
  [/\bdollar\b|\brupee\b|treasury yield|bond yield|\bforex\b|\bdxy\b/i, 2],
  [/tariff|sanction|geopolit|ceasefire|\bwar\b/i, 1],
];
export function relevance(item) {
  const t = `${item.title} ${item.summary}`; let score = 0;
  for (const [re, w] of RULES) if (re.test(t)) score += w;
  return score;
}

/** Headlines from roughly the last `hours` hours that are relevant to gold. Deduplicated, best first, capped. */
export function selectOvernight(items, { nowMs, hours = 24, minScore = 3, max = 6 } = {}) {
  const seen = new Set(), out = [];
  for (const it of items) {
    if (it.publishedMs == null || nowMs - it.publishedMs > hours * 36e5 || it.publishedMs - nowMs > 6 * 36e5) continue;
    const score = relevance(it); if (score < minScore) continue;
    const key = it.link.split("#")[0].split("?")[0] || it.title.toLowerCase();
    const tkey = it.title.toLowerCase().slice(0, 60);
    if (seen.has(key) || seen.has(tkey)) continue; seen.add(key); seen.add(tkey);
    out.push({ ...it, score });
  }
  return out.sort((a, b) => b.score - a.score || b.publishedMs - a.publishedMs).slice(0, max);
}

// ---------- calendar (ICS) for scheduled releases ----------
function tzOffsetMs(ms, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - ms;
}
/** Wall-clock time in `tz` -> epoch ms (handles daylight saving). */
export function zonedToUtc(y, mo, d, h, mi, tz) {
  const guess = Date.UTC(y, mo - 1, d, h, mi); let utc = guess - tzOffsetMs(guess, tz);
  utc = guess - tzOffsetMs(utc, tz); return utc;
}
/** Minimal ICS reader: VEVENT with SUMMARY and a timed DTSTART (UTC 'Z' or TZID). All-day events are skipped. */
export function parseIcs(text) {
  const lines = String(text || "").replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").split("\n"), events = [];
  let cur = null;
  for (const line of lines) {
    if (line.startsWith("BEGIN:VEVENT")) cur = {};
    else if (line.startsWith("END:VEVENT")) { if (cur?.summary && cur.startMs != null) events.push(cur); cur = null; }
    else if (cur) {
      const m = line.match(/^([A-Z-]+)((?:;[^:]*)?):(.*)$/); if (!m) continue;
      const [, name, params, value] = m;
      if (name === "SUMMARY") cur.summary = stripTags(value.replace(/\\,/g, ",").replace(/\\n/gi, " "));
      if (name === "DTSTART") {
        const dt = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z?)$/); if (!dt) continue;
        const [y, mo, d, h, mi] = dt.slice(1, 6).map(Number), tz = params.match(/TZID=([^;:]+)/)?.[1];
        try { cur.startMs = dt[7] === "Z" ? Date.UTC(y, mo - 1, d, h, mi) : zonedToUtc(y, mo, d, h, mi, tz || "UTC"); } catch { /* unknown time zone: skip event */ }
      }
    }
  }
  return events;
}
const KEY_RELEASES = /consumer price index|employment situation|producer price index|job openings|employment cost index/i;
export const istString = (ms) => new Date(ms + 330 * 60000).toISOString().slice(0, 16);   // 'YYYY-MM-DDTHH:MM' in India time
/** Scheduled releases that fall on India's `today` or `tomorrow`. */
export function selectUpcoming(events, { today, tomorrow, nowMs }) {
  return events.filter((e) => KEY_RELEASES.test(e.summary) && e.startMs >= nowMs - 2 * 36e5 && [today, tomorrow].includes(istString(e.startMs).slice(0, 10)))
    .sort((a, b) => a.startMs - b.startMs).slice(0, 6);
}

// ---------- put it together ----------
/**
 * Returns a model-shaped object ({ overnight[], upcoming[], gold_bias, ... }) so the same validation as the AI path applies.
 * deps.fetchText(url) -> string. deps.config = { feeds, calendars }. Failures of single sources are logged and skipped.
 */
export async function collectFeedNews({ config, fetchText, nowMs, today, tomorrow, log = console.log }) {
  const all = []; let ok = 0;
  for (const f of config.feeds) {
    try { const items = parseFeed(await fetchText(f.url)); ok++; items.forEach((i) => all.push({ ...i, feed: f.name })); log(`feed ok: ${f.name} (${items.length} items)`); }
    catch (e) { log(`::warning::feed failed: ${f.name}: ${String(e.message).slice(0, 160)}`); }
  }
  let events = [];
  for (const c of config.calendars || []) {
    try { events = events.concat(parseIcs(await fetchText(c.url)).map((e) => ({ ...e, link: c.link, cal: c.name }))); ok++; log(`calendar ok: ${c.name}`); }
    catch (e) { log(`::warning::calendar failed: ${c.name}: ${String(e.message).slice(0, 160)}`); }
  }
  if (!ok) throw new Error("none of the news feeds or calendars could be read");
  const overnight = selectOvernight(all, { nowMs }).map((i) => ({
    title: i.title.slice(0, 160), url: i.link, impact: "uncertain",
    summary: (i.summary.length >= 20 ? i.summary : `${i.feed}: ${i.title}`).slice(0, 300),
  }));
  const upcoming = selectUpcoming(events, { today, tomorrow, nowMs }).map((e) => ({
    title: `${e.summary} (scheduled release)`.slice(0, 160), url: e.link, impact: "uncertain", when_ist: istString(e.startMs),
    summary: `Scheduled US data release listed on the ${e.cal}. Results that differ from expectations can move the dollar, bond yields and gold.`,
  }));
  return { overnight, upcoming, gold_bias: 0, silver_bias: 0, confidence: "low", rationale: "" };
}
