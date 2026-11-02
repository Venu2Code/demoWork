// Minimal Supabase client over REST (no third-party scripts => strict CSP). Only the public anon key is used;
// Row Level Security (supabase/schema.sql) restricts each user to their own row.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import * as store from "./store.js";

const SESSION_KEY = "lcs.session.v1";
export const enabled = () => !!(SUPABASE_URL && SUPABASE_ANON_KEY);
let session = null;
try { session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { /* ignore */ }
const saveSession = (s) => { session = s; try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ } };
export const user = () => session?.user ?? null;

async function api(path, { method = "GET", body, token, prefer } = {}) {
  const res = await fetch(SUPABASE_URL.replace(/\/$/, "") + path, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(prefer ? { Prefer: prefer } : {}) },
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(json?.msg || json?.error_description || json?.message || `Request failed (${res.status})`);
  return json;
}
const adopt = (r) => { if (!r?.access_token) return false; saveSession({ access_token: r.access_token, refresh_token: r.refresh_token, expires_at: Date.now() + (r.expires_in - 60) * 1000, user: { id: r.user.id, email: r.user.email } }); return true; };

export async function signUp(email, password) { const r = await api("/auth/v1/signup", { method: "POST", body: { email, password } }); return adopt(r) ? "signed-in" : "confirm-email"; }
export async function signIn(email, password) { adopt(await api("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } })); }
export function signOut() { saveSession(null); }

async function token() {
  if (!session) throw new Error("Not signed in");
  if (Date.now() > session.expires_at) adopt(await api("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: session.refresh_token } }));
  return session.access_token;
}

/** Pull cloud row, merge with local, push merged result. */
export async function syncNow() {
  const t = await token(), uid = session.user.id;
  const rows = await api(`/rest/v1/progress?select=data&user_id=eq.${encodeURIComponent(uid)}`, { token: t });
  const merged = rows?.[0]?.data ? store.merge(store.get(), rows[0].data) : store.get();
  store.replace(merged);
  await api("/rest/v1/progress?on_conflict=user_id", { method: "POST", token: t, prefer: "resolution=merge-duplicates,return=minimal", body: { user_id: uid, data: merged } });
  return new Date();
}
