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

// ---- session security: idle timeout survives page reloads, sign-out revokes on the server ----
const MIN = 60 * 1000;
const storedSession = (lastActiveAgoMs, over = {}) => JSON.stringify({ access_token: "old-tok", refresh_token: "old-ref", expires_at: Date.now() + 3600e3, lastActive: Date.now() - lastActiveAgoMs, user: { id: "u9", email: "old@example.com" }, ...over });
let reloadN = 0;
const reload = () => import(`../site/js/auth.js?reload=${++reloadN}`);   // a fresh copy of the module = a page reload

test("reopening the site after 30+ minutes does NOT resurrect the session, and the server session is revoked", async () => {
  reset(); store.set("gt.session.v1", storedSession(45 * MIN));
  const fresh = await reload();
  assert.equal(fresh.user(), null);
  assert.equal(store.get("gt.session.v1"), undefined, "stale session removed from storage");
  const logout = calls.find((c) => c.url.includes("/auth/v1/logout"));
  assert.ok(logout, "server was told to invalidate the old session");
  assert.equal(logout.init.headers.Authorization, "Bearer old-tok");
  await assert.rejects(() => fresh.token(), /sign in/i);
});
test("a recently active session survives a reload", async () => {
  reset(); store.set("gt.session.v1", storedSession(5 * MIN));
  const fresh = await reload();
  assert.equal(fresh.user().email, "old@example.com");
  assert.equal(await fresh.token(), "old-tok");
  fresh.signOut();
});
test("a session that goes idle while the page stays open is closed on next use", async (t) => {
  reset(); handler = () => ({ status: 200, body: session() });
  await auth.signIn("me@example.com", "correct horse battery");
  const real = Date.now; t.mock.method(Date, "now", () => real() + 31 * MIN);
  assert.equal(auth.user(), null);
  assert.equal(store.get("gt.session.v1"), undefined);
});
test("token() refuses an idle session with a clear message", async (t) => {
  reset(); handler = () => ({ status: 200, body: session() });
  await auth.signIn("me@example.com", "correct horse battery");
  const real = Date.now; t.mock.method(Date, "now", () => real() + 31 * MIN);
  await assert.rejects(() => auth.token(), /30 minutes of inactivity/);
});
test("sign-out revokes the session on the server (scope=local) with the user's own token", async () => {
  reset(); handler = () => ({ status: 200, body: session() });
  await auth.signIn("me@example.com", "correct horse battery"); calls.length = 0;
  auth.signOut();
  const logout = calls.find((c) => c.url.endsWith("/auth/v1/logout?scope=local"));
  assert.ok(logout, "logout request sent");
  assert.equal(logout.init.method, "POST"); assert.equal(logout.init.headers.Authorization, "Bearer tok"); assert.ok(logout.init.headers.apikey);
  assert.equal(auth.user(), null);
});
test("sign-out still signs out locally when the server cannot be reached", async () => {
  reset(); handler = () => ({ status: 200, body: session() });
  await auth.signIn("me@example.com", "correct horse battery");
  handler = () => ({ throw: "Failed to fetch" });
  assert.doesNotThrow(() => auth.signOut());
  await new Promise((r) => setTimeout(r, 20));      // an unhandled rejection from the revoke call would fail the run
  assert.equal(auth.user(), null); assert.equal(store.get("gt.session.v1"), undefined);
});
