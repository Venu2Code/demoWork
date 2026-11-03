// Email/password auth against Supabase GoTrue over REST. The session token is kept in localStorage only
// (never purchases) and is wiped on sign-out or after 30 minutes of inactivity.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
const KEY = "gt.session.v1", IDLE_MS = 30 * 60 * 1000;
let session = null, idleTimer = null;
const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);
const emit = () => listeners.forEach((f) => f(session));
try { session = JSON.parse(localStorage.getItem(KEY) || "null"); } catch { session = null; }

async function call(path, body) {
  const res = await fetch(SUPABASE_URL.replace(/\/$/, "") + path, { method: "POST", headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const t = await res.text(); const j = t ? JSON.parse(t) : {};
  if (!res.ok) throw new Error(j.msg || j.error_description || j.message || `Request failed (${res.status})`);
  return j;
}
function store(r) {
  if (!r?.access_token) return false;
  session = { access_token: r.access_token, refresh_token: r.refresh_token, expires_at: Date.now() + (r.expires_in - 60) * 1000, user: { id: r.user.id, email: r.user.email } };
  try { localStorage.setItem(KEY, JSON.stringify(session)); } catch { /* private mode */ }
  armIdle(); emit(); return true;
}
function armIdle() { clearTimeout(idleTimer); idleTimer = setTimeout(signOut, IDLE_MS); }
if (typeof addEventListener === "function") ["click", "keydown", "touchstart"].forEach((ev) => addEventListener(ev, () => session && armIdle(), { passive: true }));

export const user = () => session?.user ?? null;
export async function signUp(email, password) {
  if (password.length < 12) throw new Error("Use a password of at least 12 characters.");
  return store(await call("/auth/v1/signup", { email, password })) ? "signed-in" : "confirm-email";
}
export async function signIn(email, password) { store(await call("/auth/v1/token?grant_type=password", { email, password })); }
export function signOut() { session = null; clearTimeout(idleTimer); try { localStorage.removeItem(KEY); } catch { /* ignore */ } emit(); }
export async function token() {
  if (!session) throw new Error("Please sign in.");
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
