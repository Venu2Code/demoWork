import test from "node:test";
import assert from "node:assert/strict";

// Minimal browser-ish globals so site/js/auth.js can run in Node.
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
let handler = () => ({ status: 200, body: {} });
const calls = [];
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  const r = handler(String(url), init);
  if (r.throw) throw new TypeError(r.throw);
  return { ok: r.status >= 200 && r.status < 300, status: r.status, text: async () => JSON.stringify(r.body) };
};
const auth = await import("../site/js/auth.js");
const session = (over = {}) => ({ access_token: "tok", refresh_token: "ref", expires_in: 3600, user: { id: "u1", email: "me@example.com" }, ...over });
const reset = () => { auth.signOut(); calls.length = 0; handler = () => ({ status: 200, body: {} }); };

test("sign-up rejects short passwords without calling the server", async () => {
  reset();
  await assert.rejects(() => auth.signUp("me@example.com", "short"), /at least 12/);
  assert.equal(calls.length, 0);
});
test("sign-up with email confirmation ON returns 'confirm-email' and creates no session", async () => {
  reset();
  handler = () => ({ status: 200, body: { id: "u1", email: "me@example.com", confirmation_sent_at: "2026-11-03T00:00:00Z" } });
  assert.equal(await auth.signUp("me@example.com", "correct horse battery"), "confirm-email");
  assert.equal(auth.user(), null);
});
test("sign-up with confirmation OFF signs the user in", async () => {
  reset();
  handler = () => ({ status: 200, body: session() });
  assert.equal(await auth.signUp("me@example.com", "correct horse battery"), "signed-in");
  assert.equal(auth.user().email, "me@example.com");
  assert.equal(await auth.token(), "tok");
});
test("requests send only the apikey header (no bearer) for auth calls", async () => {
  reset();
  handler = () => ({ status: 200, body: session() });
  await auth.signIn("me@example.com", "correct horse battery");
  const h = calls[0].init.headers;
  assert.ok(h.apikey); assert.equal(h.Authorization, undefined);
  assert.match(calls[0].url, /\/auth\/v1\/token\?grant_type=password$/);
});
test("server errors surface their message", async () => {
  reset();
  handler = () => ({ status: 400, body: { error_code: "invalid_credentials", msg: "Invalid login credentials" } });
  await assert.rejects(() => auth.signIn("me@example.com", "wrong password here"), /Invalid login credentials/);
  assert.equal(auth.user(), null);
});
test("network failure rejects instead of hanging silently", async () => {
  reset();
  handler = () => ({ throw: "Failed to fetch" });
  await assert.rejects(() => auth.signUp("me@example.com", "correct horse battery"), /Failed to fetch/);
});
test("expired token is refreshed; a failed refresh signs the user out", async () => {
  reset();
  handler = () => ({ status: 200, body: session({ expires_in: 1 }) });   // already expired (60 s safety margin)
  await auth.signIn("me@example.com", "correct horse battery");
  handler = (url) => (url.includes("refresh_token") ? { status: 200, body: session({ access_token: "tok2" }) } : { status: 500, body: {} });
  assert.equal(await auth.token(), "tok2");
  handler = () => ({ status: 200, body: session({ expires_in: 1 }) });
  await auth.signIn("me@example.com", "correct horse battery");
  handler = () => ({ status: 400, body: { msg: "Invalid Refresh Token" } });
  await assert.rejects(() => auth.token(), /expired/i);
  assert.equal(auth.user(), null);
});
test("sign-out clears the stored session and purchases are never persisted", async () => {
  reset();
  handler = () => ({ status: 200, body: session() });
  await auth.signIn("me@example.com", "correct horse battery");
  assert.ok(store.get("gt.session.v1"));
  auth.signOut();
  assert.equal(store.get("gt.session.v1"), undefined);
  assert.ok(![...store.values()].some((v) => v.includes("total_paid")));
  await assert.rejects(() => auth.token(), /sign in/i);
});
test("explain() turns technical errors into plain language", () => {
  assert.match(auth.explain("Invalid login credentials"), /confirmed your email/);
  assert.match(auth.explain("email rate limit exceeded"), /wait a few minutes/);
  assert.match(auth.explain("User already registered"), /already has an account/);
  assert.match(auth.explain("Failed to fetch"), /internet connection/);
  assert.match(auth.explain("Signups not allowed for this instance"), /switched off/);
  assert.equal(auth.explain(""), "Something went wrong. Please try again.");
});
