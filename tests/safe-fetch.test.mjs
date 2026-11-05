import test from "node:test";
import assert from "node:assert/strict";
import { safeFetch, readLimited, redact } from "../scripts/lib/common.mjs";

const LIST = { allowed: ["good.example", "also-good.example"], blocked: ["bad.example"] };
const opts = { retryDelayMs: 0 };
const realFetch = globalThis.fetch;
const script = (handler) => { const seen = []; globalThis.fetch = async (url, init) => { seen.push({ url: String(url), init }); return handler(String(url), init, seen.length); }; return seen; };
test.afterEach(() => { globalThis.fetch = realFetch; });
const redirect = (to, status = 302) => new Response(null, { status, headers: { location: to } });

test("follows redirects between trusted hosts, one hop at a time", async () => {
  const seen = script((u) => (u === "https://good.example/a" ? redirect("https://also-good.example/b") : u === "https://also-good.example/b" ? redirect("/c") : new Response("final")));
  const res = await safeFetch("https://good.example/a", {}, LIST, opts);
  assert.equal(await res.text(), "final");
  assert.deepEqual(seen.map((s) => s.url), ["https://good.example/a", "https://also-good.example/b", "https://also-good.example/c"], "relative redirects are resolved");
  assert.ok(seen.every((s) => s.init.redirect === "manual"), "the platform is never allowed to follow redirects by itself");
});
test("refuses a redirect from a trusted host to an untrusted one (and never contacts it)", async () => {
  const seen = script((u) => (u.startsWith("https://good.example") ? redirect("https://evil.example/steal?apikey=SECRET123") : new Response("should not be reached")));
  await assert.rejects(() => safeFetch("https://good.example/feed", {}, LIST, opts), (e) => { assert.match(e.message, /refusing to fetch non-allowlisted URL/); assert.ok(!e.message.includes("SECRET123")); return true; });
  assert.equal(seen.length, 1, "the untrusted host was never requested");
});
test("refuses redirects to a blocked host, to plain http, and to garbage", async () => {
  for (const target of ["https://bad.example/x", "http://good.example/downgrade", "https://user:pw@good.example/x", "https://good.example:8443/x"]) {
    script(() => redirect(target));
    await assert.rejects(() => safeFetch("https://good.example/a", {}, LIST, opts), /refusing/, target);
  }
  script(() => redirect("http://[::bad"));
  await assert.rejects(() => safeFetch("https://good.example/a", {}, LIST, opts), /invalid address/);
});
test("stops after too many redirects", async () => {
  script(() => redirect("https://good.example/loop"));
  await assert.rejects(() => safeFetch("https://good.example/loop", {}, LIST, opts), /too many redirects/);
});
test("retries once on a server error, then reports it without leaking the key", async () => {
  let n = 0; script(() => (++n === 1 ? new Response("oops", { status: 503 }) : new Response("ok")));
  assert.equal(await (await safeFetch("https://good.example/x", {}, LIST, opts)).text(), "ok");
  script(() => { throw new Error("connect failed https://good.example/x?apikey=TOPSECRET"); });
  await assert.rejects(() => safeFetch("https://good.example/x", {}, LIST, opts), (e) => { assert.ok(!e.message.includes("TOPSECRET")); return true; });
});
test("untrusted first URL is refused before any request", async () => {
  const seen = script(() => new Response("x"));
  await assert.rejects(() => safeFetch("https://evil.example/", {}, LIST, opts), /refusing/);
  assert.equal(seen.length, 0);
});

test("readLimited returns small bodies and refuses oversized ones, with or without a content-length header", async () => {
  assert.equal(await readLimited(new Response("hello"), 100), "hello");
  await assert.rejects(() => readLimited(new Response("x".repeat(1000)), 100), /too large/);          // streamed, no header check needed
  await assert.rejects(() => readLimited(new Response("small", { headers: { "content-length": "999999999" } }), 100), /too large/);
  const stream = new ReadableStream({ start(c) { for (let i = 0; i < 50; i++) c.enqueue(new Uint8Array(100)); c.close(); } });
  await assert.rejects(() => readLimited(new Response(stream), 1000), /too large/);
  assert.equal(await readLimited(new Response("héllo ✓"), 100), "héllo ✓", "UTF-8 survives");
});
test("redact hides keys in URLs", () => assert.equal(redact("https://a.b/c?x=1&apikey=ABC&y=2"), "https://a.b/c?x=1&apikey=***&y=2"));
