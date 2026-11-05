import test from "node:test";
import assert from "node:assert/strict";
import { parseFeed, relevance, selectOvernight, parseIcs, selectUpcoming, zonedToUtc, istString, collectFeedNews, decodeEntities } from "../scripts/lib/feeds.mjs";
import { validateNews } from "../scripts/lib/outlook.mjs";
import { loadAllowlist } from "../scripts/lib/common.mjs";

// All feeds below are synthetic samples written for these tests.
const NOW = Date.parse("2026-11-03T00:30:00Z");                         // 06:00 IST on Tue 3 Nov 2026
const rfc = (hoursAgo) => new Date(NOW - hoursAgo * 36e5).toUTCString();

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>Sample</title>
<item><title><![CDATA[Gold climbs as dollar slips ahead of Fed decision]]></title><link>http://www.livemint.com/markets/gold-climbs-1</link>
<description><![CDATA[<p>Spot gold rose 1% as the <b>dollar</b> fell &amp; traders waited for the Fed.</p><script>alert(1)</script>]]></description><pubDate>${rfc(3)}</pubDate></item>
<item><title>Cricket final draws record crowd</title><link>https://www.livemint.com/sports/cricket-2</link><description>Sports news</description><pubDate>${rfc(2)}</pubDate></item>
<item><title>Old gold story from last week</title><link>https://www.livemint.com/markets/old-3</link><description>gold</description><pubDate>${rfc(200)}</pubDate></item>
<item><title>Gold climbs as dollar slips ahead of Fed decision</title><link>https://www.livemint.com/markets/gold-climbs-dup?utm=x</link><description>duplicate title</description><pubDate>${rfc(4)}</pubDate></item>
<item><title>Undated item about gold</title><link>https://www.livemint.com/markets/undated</link></item>
</channel></rss>`;
const ATOM = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>RBI keeps repo rate unchanged, monetary policy statement</title><link rel="alternate" href="https://www.rbi.org.in/press/1"/><summary>Monetary Policy Committee decision on the repo rate.</summary><updated>${new Date(NOW - 5 * 36e5).toISOString()}</updated></entry></feed>`;

test("parseFeed reads RSS (CDATA, entities, tags stripped, http upgraded) and Atom", () => {
  const items = parseFeed(RSS);
  assert.equal(items.length, 5);
  const first = items[0];
  assert.equal(first.title, "Gold climbs as dollar slips ahead of Fed decision");
  assert.equal(first.link, "https://www.livemint.com/markets/gold-climbs-1");
  assert.ok(!/[<>]/.test(first.summary), "no markup survives");
  assert.match(first.summary, /dollar fell & traders/);
  assert.equal(items.find((i) => i.title.startsWith("Undated")).publishedMs, null);
  const atom = parseFeed(ATOM);
  assert.equal(atom.length, 1); assert.equal(atom[0].link, "https://www.rbi.org.in/press/1"); assert.ok(atom[0].publishedMs);
});
test("parseFeed never throws on garbage and decodeEntities handles numeric entities safely", () => {
  assert.deepEqual(parseFeed(""), []); assert.deepEqual(parseFeed(null), []); assert.deepEqual(parseFeed("<html><body>403 Forbidden</body></html>"), []);
  assert.deepEqual(parseFeed("<item><title>unterminated"), []);
  assert.equal(decodeEntities("A&#8211;B &#x41; &#99999999999; &unknown;"), "A–B A" + " " + " " + " " + "&unknown;", "invalid numeric entity becomes a space; unknown named entity is left as text");
});

test("relevance prefers gold/central-bank/duty news and ignores unrelated items", () => {
  assert.ok(relevance({ title: "Gold hits record", summary: "" }) >= 5);
  assert.ok(relevance({ title: "FOMC holds interest rate steady", summary: "" }) >= 4);
  assert.ok(relevance({ title: "Government raises import duty on gold", summary: "" }) >= 8);
  assert.equal(relevance({ title: "Cricket final draws record crowd", summary: "Sports news" }), 0);
});
test("selectOvernight keeps recent relevant items, drops stale/undated/duplicate, sorts best first, caps the list", () => {
  const items = [...parseFeed(RSS), ...parseFeed(ATOM)];
  const out = selectOvernight(items, { nowMs: NOW });
  assert.deepEqual(out.map((i) => i.title), ["Gold climbs as dollar slips ahead of Fed decision", "RBI keeps repo rate unchanged, monetary policy statement"]);
  assert.equal(selectOvernight(Array.from({ length: 20 }, (_, i) => ({ title: `Gold story number ${i}`, link: `https://a.b/${i}`, summary: "", publishedMs: NOW - 3600e3 })), { nowMs: NOW }).length, 6);
  assert.equal(selectOvernight([{ title: "Gold from the future", link: "https://a.b/f", summary: "", publishedMs: NOW + 48 * 36e5 }], { nowMs: NOW }).length, 0);
});

test("time zones: US Eastern release times convert correctly across daylight saving", () => {
  assert.equal(new Date(zonedToUtc(2026, 11, 12, 8, 30, "America/New_York")).toISOString(), "2026-11-12T13:30:00.000Z");   // EST (UTC-5)
  assert.equal(new Date(zonedToUtc(2026, 7, 14, 8, 30, "America/New_York")).toISOString(), "2026-07-14T12:30:00.000Z");    // EDT (UTC-4)
  assert.equal(istString(Date.parse("2026-11-12T13:30:00Z")), "2026-11-12T19:00");
});
const ICS = [
  "BEGIN:VCALENDAR", "BEGIN:VEVENT", "SUMMARY:Consumer Price Index for October 2026", "DTSTART;TZID=America/New_York:20261112T083000", "END:VEVENT",
  "BEGIN:VEVENT", "SUMMARY:Employment Situation for", "  October 2026", "DTSTART:20261103T133000Z", "END:VEVENT",
  "BEGIN:VEVENT", "SUMMARY:Import and Export Prices", "DTSTART;TZID=America/New_York:20261103T083000", "END:VEVENT",
  "BEGIN:VEVENT", "SUMMARY:Producer Price Index (all day)", "DTSTART;VALUE=DATE:20261103", "END:VEVENT",
  "BEGIN:VEVENT", "SUMMARY:Job Openings and Labor Turnover", "DTSTART;TZID=Not/AZone:20261103T100000", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
test("ICS calendar: folded lines, UTC and TZID times; all-day and unknown-zone events skipped; only key releases for India's today/tomorrow", () => {
  const ev = parseIcs(ICS);
  assert.equal(ev.length, 3, "all-day and bad-zone events are skipped");
  assert.ok(ev.some((e) => e.summary === "Employment Situation for October 2026"), "folded line joined");
  const up = selectUpcoming(ev, { today: "2026-11-03", tomorrow: "2026-11-04", nowMs: NOW });
  assert.deepEqual(up.map((e) => e.summary), ["Employment Situation for October 2026"], "CPI on the 12th is too far away; import prices is not a key release");
  assert.equal(istString(up[0].startMs), "2026-11-03T19:00");
});

const CONFIG = { feeds: [{ name: "Mint (markets)", url: "https://www.livemint.com/rss/markets" }, { name: "Reserve Bank of India", url: "https://www.rbi.org.in/pressreleases_rss.xml" }, { name: "Broken feed", url: "https://www.bls.gov/feed/x.rss" }], calendars: [{ name: "US BLS release calendar", url: "https://www.bls.gov/schedule/news_release/bls.ics", link: "https://www.bls.gov/schedule/news_release/" }] };
const stub = (map) => async (url) => { const v = map[url]; if (v instanceof Error) throw v; if (v == null) throw new Error("HTTP 404"); return v; };
const ctx = { list: loadAllowlist(), seenUrls: null, today: "2026-11-03", tomorrow: "2026-11-04" };

test("collectFeedNews: tolerates failing feeds, and its output passes the same validation as AI output", async () => {
  const logs = [];
  const raw = await collectFeedNews({ config: CONFIG, nowMs: NOW, today: ctx.today, tomorrow: ctx.tomorrow, log: (m) => logs.push(m),
    fetchText: stub({ [CONFIG.feeds[0].url]: RSS, [CONFIG.feeds[1].url]: ATOM, [CONFIG.feeds[2].url]: new Error("HTTP 403"), [CONFIG.calendars[0].url]: ICS }) });
  assert.ok(logs.some((l) => /feed failed: Broken feed: HTTP 403/.test(l)), "failure is logged, not hidden");
  assert.equal(raw.overnight.length, 2); assert.equal(raw.upcoming.length, 1); assert.equal(raw.gold_bias, 0);
  assert.ok(raw.overnight.every((i) => i.impact === "uncertain"), "no one judged the impact");
  const over = validateNews(raw.overnight, "overnight", ctx), up = validateNews(raw.upcoming, "upcoming", ctx);
  assert.equal(over.items.length, 2, over.rejected.join("; ")); assert.equal(up.items.length, 1, up.rejected.join("; "));
  assert.equal(up.items[0].impact, "uncertain"); assert.equal(up.items[0].source, "bls.gov");
  assert.ok(over.items.every((i) => i.url.startsWith("https://")));
});
test("collectFeedNews: links to untrusted domains are rejected by validation, and a total failure throws", async () => {
  const evil = RSS.replace("https://www.livemint.com/markets/gold-climbs-1", "https://evil.example/x").replace("http://www.livemint.com/markets/gold-climbs-1", "http://evil.example/x");
  const raw = await collectFeedNews({ config: { feeds: [CONFIG.feeds[0]], calendars: [] }, nowMs: NOW, today: ctx.today, tomorrow: ctx.tomorrow, log: () => {}, fetchText: stub({ [CONFIG.feeds[0].url]: evil }) });
  const v = validateNews(raw.overnight, "overnight", ctx);
  assert.equal(v.items.length, 0); assert.match(v.rejected.join(), /url not allowed/);
  await assert.rejects(() => collectFeedNews({ config: CONFIG, nowMs: NOW, today: ctx.today, tomorrow: ctx.tomorrow, log: () => {}, fetchText: stub({}) }), /none of the news feeds/);
});
test("config/feeds.json only uses hosts on the trusted list", async () => {
  const { readFileSync } = await import("node:fs");
  const cfg = JSON.parse(readFileSync(new URL("../config/feeds.json", import.meta.url), "utf8")), { isAllowedUrl } = await import("../scripts/lib/common.mjs");
  for (const u of [...cfg.feeds.map((f) => f.url), ...cfg.calendars.flatMap((c) => [c.url, c.link])]) assert.ok(isAllowedUrl(u), `${u} is not on the allowlist`);
});
