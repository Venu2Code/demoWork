// Email/password auth against Supabase GoTrue over REST.
// The login session lives in localStorage (never purchases). Security behaviour:
//  - 30 minutes without activity ends the session EVEN IF the tab was closed meanwhile (the last-activity time is stored
//    with the session and checked on page load, on every use and when the tab becomes visible again);
//  - "Sign out" also revokes the session on the server, so a copied refresh token stops working.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
const KEY = "gt.session.v1", IDLE_MS = 30 * 60 * 1000, TOUCH_EVERY_MS = 15 * 1000;
let session = null, idleTimer = null;
const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);
const emit = () => listeners.forEach((f) => f(session));
const base = () => SUPABASE_URL.replace(/\/$/, "");
const idleExpired = (s) => !s || Date.now() - (s.lastActive || 0) > IDLE_MS;
function persist() { try { localStorage.setItem(KEY, JSON.stringify(session)); } catch { /* private mode */ } }
function wipeLocal() { session = null; clearTimeout(idleTimer); try { localStorage.removeItem(KEY); } catch { /* ignore */ } }

try { session = JSON.parse(localStorage.getItem(KEY) || "null"); } catch { session = null; }
if (session && idleExpired(session)) {          // reopened after a long absence: do not resurrect the session
  const old = session.access_token; wipeLocal(); revokeOnServer(old);
}

async function call(path, body) {
  const res = await fetch(base() + path, { method: "POST", headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const t = await res.text(); const j = t ? JSON.parse(t) : {};
  if (!res.ok) throw new Error(j.msg || j.error_description || j.message || `Request failed (${res.status})`);
  return j;
}
/** Best effort: tell Supabase to invalidate this device's session (scope=local keeps other devices signed in). */
function revokeOnServer(accessToken) {
  if (!accessToken) return;
  try { Promise.resolve(fetch(`${base()}/auth/v1/logout?scope=local`, { method: "POST", keepalive: true, headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` } })).catch(() => {}); } catch { /* ignore */ }
}
function store(r) {
  if (!r?.access_token) return false;
  session = { access_token: r.access_token, refresh_token: r.refresh_token, expires_at: Date.now() + (r.expires_in - 60) * 1000, lastActive: Date.now(), user: { id: r.user.id, email: r.user.email } };
  persist(); armIdle(); emit(); return true;
}
function armIdle() { clearTimeout(idleTimer); idleTimer = setTimeout(signOut, IDLE_MS); idleTimer?.unref?.(); }   // unref: only matters in Node tests
function touch() {                               // called on user activity; throttled so storage is not hammered
  if (!session) return;
  if (idleExpired(session)) { signOut(); return; }
  if (Date.now() - session.lastActive > TOUCH_EVERY_MS) { session.lastActive = Date.now(); persist(); }
  armIdle();
}
if (typeof addEventListener === "function") {
  ["click", "keydown", "touchstart"].forEach((ev) => addEventListener(ev, touch, { passive: true }));
  addEventListener("visibilitychange", () => { if (session && document.visibilityState === "visible" && idleExpired(session)) signOut(); });
}

export function user() { if (session && idleExpired(session)) signOut(); return session?.user ?? null; }
export async function signUp(email, password) {
  if (password.length < 12) throw new Error("Use a password of at least 12 characters.");
  return store(await call("/auth/v1/signup", { email, password })) ? "signed-in" : "confirm-email";
}
export async function signIn(email, password) { store(await call("/auth/v1/token?grant_type=password", { email, password })); }
export function signOut() { const t = session?.access_token; wipeLocal(); emit(); revokeOnServer(t); }
export async function token() {
  if (!session) throw new Error("Please sign in.");
  if (idleExpired(session)) { signOut(); throw new Error("You were signed out after 30 minutes of inactivity. Please sign in again."); }
  if (Date.now() > session.expires_at) { try { store(await call("/auth/v1/token?grant_type=refresh_token", { refresh_token: session.refresh_token })); } catch { signOut(); throw new Error("Session expired. Please sign in again."); } }
  return session.access_token;
}
if (session) armIdle();

/** Turn Supabase's technical messages into plain language the user can act on. */
export function explain(message) {
  const m = String(message || "");
  if (/invalid login credentials/i.test(m)) return "Email or password is wrong, or you haven't confirmed your email yet. Check your inbox (and spam) for the confirmation link.";
  if (/email not confirmed/i.test(m)) return "Please confirm your email first. Open the link we sent you (check spam), then sign in.";
  if (/already registered|already been registered/i.test(m)) return "This email already has an account. Click Sign in instead.";
  if (/rate limit|too many/i.test(m)) return "Too many attempts or emails sent. Please wait a few minutes and try again.";
  if (/failed to fetch|networkerror|load failed/i.test(m)) return "Couldn't reach the server. Check your internet connection and try again.";
  if (/signups? not allowed|signup_disabled/i.test(m)) return "New sign-ups are switched off for this site.";
  if (/password/i.test(m)) return m;
  return m || "Something went wrong. Please try again.";
}
