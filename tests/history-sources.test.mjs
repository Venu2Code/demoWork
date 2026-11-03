import test from "node:test";
import assert from "node:assert/strict";
import { parseTwelveData, loadUsdHistory, usdSane, httpErrorMessage } from "../scripts/lib/history.mjs";
import { redact, safeFetch } from "../scripts/lib/common.mjs";

// Synthetic test series shaped like Twelve Data's time_series response (values are strings, newest first).
const series = (days, base = 2000) => ({ meta: { symbol: "XAU/USD" }, status: "ok", values: Array.from({ length: days }, (_, i) => { const d = new Date(Date.UTC(2026, 10, 3) - i * 864e5).toISOString().slice(0, 10), c = base + (i % 40); return { datetime: d, open: String(c - 2), high: String(c + 5), low: String(c - 6), close: String(c) }; }) });
const ctx = (over = {}) => ({ env: { TWELVEDATA_API_KEY: "SECRETKEY123" }, start: "2023-10-30", end: "2026-11-03", minDays: 1095, ...over });
const reply = (obj) => async () => JSON.stringify(obj);

test("parseTwelveData reads strings, sorts oldest first and skips junk rows", () => {
  const rows = parseTwelveData({ status: "ok", values: [{ datetime: "2026-01-03", open: "2", high: "3", low: "1", close: "2.5" }, { datetime: "2026-01-02", open: "x", high: "3", low: "1", close: "2" }, { datetime: "2026-01-01 00:00:00", open: "1", high: "2", low: "0.5", close: "1.5" }] });
  assert.deepEqual(rows.map((r) => r.day), ["2026-01-01", "2026-01-03"]);
  assert.equal(rows[1].close, 2.5);
});
test("parseTwelveData surfaces provider errors", () => {
  assert.throws(() => parseTwelveData({ code: 401, message: "Invalid API key", status: "error" }), /Invalid API key/);
  assert.throws(() => parseTwelveData({ status: "ok", values: [] }), /no usable rows/);
});
test("loadUsdHistory accepts a complete, plausible 3-year series", async () => {
  const r = await loadUsdHistory("gold", { ...ctx(), getText: reply(series(1100)) });
  assert.equal(r.rows.length, 1100); assert.match(r.label, /twelvedata XAU\/USD/);
});
test("loadUsdHistory builds the right request and keeps the key out of the headers/logs", async () => {
  let seen; await loadUsdHistory("silver", { ...ctx(), getText: async (url, h) => { seen = { url, h }; return JSON.stringify(series(1100, 30)); } });
  assert.match(seen.url, /^https:\/\/api\.twelvedata\.com\/time_series\?symbol=XAG%2FUSD&interval=1day&start_date=2023-10-30&end_date=2026-11-03&outputsize=5000&order=ASC&apikey=SECRETKEY123$/);
  assert.deepEqual(seen.h, {});
});
test("missing key gives a clear, actionable error", async () => {
  await assert.rejects(() => loadUsdHistory("gold", { ...ctx({ env: {} }), getText: reply(series(1100)) }), /TWELVEDATA_API_KEY secret is not set/);
});
test("too little history is rejected (never silently loads under 3 years)", async () => {
  await assert.rejects(() => loadUsdHistory("gold", { ...ctx(), getText: reply(series(400)) }), /coverage problem: only \d+ days/);
});
test("implausible prices (wrong symbol/units) are rejected", async () => {
  await assert.rejects(() => loadUsdHistory("gold", { ...ctx(), getText: reply(series(1100, 25)) }), /plausible range/);
  assert.equal(usdSane("silver", [{ close: 30, low: 29, high: 31 }]), true);
  assert.equal(usdSane("silver", [{ close: 2000, low: 1990, high: 2010 }]), false);
});
test("provider/HTTP failures are reported without ever printing the API key", async () => {
  const bad = async () => { throw new Error("HTTP 429 for https://api.twelvedata.com/time_series?symbol=XAU/USD&apikey=SECRETKEY123"); };
  await assert.rejects(() => loadUsdHistory("gold", { ...ctx(), getText: bad }), (e) => { assert.match(e.message, /HTTP 429/); assert.ok(!e.message.includes("SECRETKEY123")); return true; });
  await assert.rejects(() => loadUsdHistory("gold", { ...ctx(), getText: reply({ status: "error", code: 401, message: "bad key SECRETKEY123 rejected" }) }), (e) => { assert.match(e.message, /twelvedata XAU\/USD: provider error: bad key \*\*\* rejected/); assert.ok(!e.message.includes("SECRETKEY123")); return true; });
});
test("redact hides keys in URLs and safeFetch refuses unlisted hosts without echoing keys", async () => {
  assert.equal(redact("x https://a.b/c?x=1&apikey=ABC123&y=2"), "x https://a.b/c?x=1&apikey=***&y=2");
  await assert.rejects(() => safeFetch("https://evil.example/data?apikey=TOPSECRET"), (e) => { assert.match(e.message, /refusing/); assert.ok(!e.message.includes("TOPSECRET")); return true; });
});

test("httpErrorMessage keeps the provider's explanation so failures are diagnosable", () => {
  assert.equal(httpErrorMessage(404, JSON.stringify({ code: 404, message: "symbol is missing or invalid", status: "error" })), "HTTP 404: symbol is missing or invalid");
  assert.equal(httpErrorMessage(403, JSON.stringify({ message: "available starting with the Grow plan" })), "HTTP 403: available starting with the Grow plan");
  assert.equal(httpErrorMessage(502, "<html>Bad gateway</html>"), "HTTP 502: <html>Bad gateway</html>");
  assert.equal(httpErrorMessage(500, ""), "HTTP 500");
  assert.ok(httpErrorMessage(500, "x".repeat(5000)).length < 200);
});
test("a provider message that echoes the key is scrubbed before it reaches the log", async () => {
  const getText = async () => { throw new Error(httpErrorMessage(401, JSON.stringify({ message: "key SECRETKEY123 is invalid" }))); };
  await assert.rejects(() => loadUsdHistory("silver", { ...ctx(), getText }), (e) => { assert.match(e.message, /HTTP 401: key \*\*\* is invalid/); assert.ok(!e.message.includes("SECRETKEY123")); return true; });
});
