// Progress state: localStorage first, optional cloud sync (see sync.js). Pure helpers are exported for tests.
const KEY = "lcs.progress.v1";
export const today = (d = new Date()) => d.toISOString().slice(0, 10);
export const blank = () => ({ v: 1, completed: {}, notes: {}, activity: {}, bookmarks: [], read: [], settings: { goal: 1, theme: "auto" }, updated: 0 });

let state = blank();
const subs = new Set();
export const subscribe = (fn) => (subs.add(fn), () => subs.delete(fn));
export const get = () => state;

export function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) state = { ...blank(), ...JSON.parse(raw) }; } catch { /* private mode: run in-memory */ }
  return state;
}
export function replace(next) { state = { ...blank(), ...next }; persist(false); }
function persist(touch = true) {
  if (touch) state.updated = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
  subs.forEach((f) => f(state));
}

const bump = (field, n = 1, xp = 0) => {
  const d = (state.activity[today()] ??= { xp: 0, lessons: 0, news: 0 });
  d[field] = (d[field] || 0) + n; d.xp += xp;
};

export const xpFor = (lesson) => 10 + lesson.level * 5 + Math.round(lesson.minutes / 10) * 2;
export function completeLesson(lesson, quizCorrect) {
  if (state.completed[lesson.id]) return false;
  const xp = xpFor(lesson) + (quizCorrect ? 5 : 0);
  state.completed[lesson.id] = { at: new Date().toISOString(), quiz: !!quizCorrect, xp };
  bump("lessons", 1, xp); persist(); return xp;
}
export function uncompleteLesson(id) { delete state.completed[id]; persist(); }
export function setNote(id, text) { if (text.trim()) state.notes[id] = text.slice(0, 4000); else delete state.notes[id]; persist(); }
export function toggleBookmark(id) { const i = state.bookmarks.indexOf(id); i < 0 ? state.bookmarks.push(id) : state.bookmarks.splice(i, 1); persist(); }
export function markRead(id) { if (!state.read.includes(id)) { state.read.push(id); if (state.read.length > 500) state.read.shift(); bump("news", 1, 2); persist(); } }
export function setSetting(k, v) { state.settings[k] = v; persist(); }

// ---- derived stats (pure) ----
export const totalXp = (s) => Object.values(s.completed).reduce((a, c) => a + (c.xp || 0), 0) + (s.read.length * 2);
export const levelFor = (xp) => { let lvl = 1, need = 100, left = xp; while (left >= need) { left -= need; lvl++; need = Math.round(need * 1.35); } return { level: lvl, into: left, need }; };
export function streak(s, now = new Date()) {
  const active = (k) => { const a = s.activity[k]; return a && (a.lessons || a.news); };
  const d = new Date(now); let n = 0;
  if (!active(today(d))) d.setUTCDate(d.getUTCDate() - 1); // today not done yet: streak still alive until midnight
  while (active(today(d))) { n++; d.setUTCDate(d.getUTCDate() - 1); }
  return n;
}
export const trackProgress = (s, lessons, track) => { const l = lessons.filter((x) => x.track === track); const done = l.filter((x) => s.completed[x.id]).length; return { done, total: l.length, pct: l.length ? Math.round((done / l.length) * 100) : 0 }; };

export const BADGES = [
  { id: "first", name: "First Step", desc: "Complete your first lesson", test: (s) => Object.keys(s.completed).length >= 1 },
  { id: "five", name: "Getting Serious", desc: "Complete 5 lessons", test: (s) => Object.keys(s.completed).length >= 5 },
  { id: "ten", name: "Double Digits", desc: "Complete 10 lessons", test: (s) => Object.keys(s.completed).length >= 10 },
  { id: "streak3", name: "On a Roll", desc: "3-day streak", test: (s) => streak(s) >= 3 },
  { id: "streak7", name: "Week Warrior", desc: "7-day streak", test: (s) => streak(s) >= 7 },
  { id: "quiz", name: "Sharp Mind", desc: "Ace 5 quizzes first try", test: (s) => Object.values(s.completed).filter((c) => c.quiz).length >= 5 },
  { id: "reader", name: "Staying Current", desc: "Read 10 news items", test: (s) => s.read.length >= 10 },
  { id: "all", name: "Full Stack Mind", desc: "Finish a lesson in every track", test: (s, lessons) => ["hardware", "programming", "networking", "ai", "cloud"].every((t) => lessons.some((l) => l.track === t && s.completed[l.id])) },
];

/** Merge two progress documents (device A + cloud). Union of work, never loses progress. */
export function merge(a, b) {
  const out = blank();
  out.completed = { ...b.completed, ...a.completed };
  for (const id of Object.keys(out.completed)) { const x = a.completed?.[id], y = b.completed?.[id]; if (x && y) out.completed[id] = x.at <= y.at ? x : y; }
  for (const day of new Set([...Object.keys(a.activity || {}), ...Object.keys(b.activity || {})])) {
    const x = a.activity?.[day] || {}, y = b.activity?.[day] || {};
    out.activity[day] = { xp: Math.max(x.xp || 0, y.xp || 0), lessons: Math.max(x.lessons || 0, y.lessons || 0), news: Math.max(x.news || 0, y.news || 0) };
  }
  const newer = (a.updated || 0) >= (b.updated || 0) ? a : b;
  out.notes = { ...(newer === a ? b : a).notes, ...newer.notes };
  out.settings = { ...blank().settings, ...newer.settings };
  out.bookmarks = [...new Set([...(a.bookmarks || []), ...(b.bookmarks || [])])];
  out.read = [...new Set([...(a.read || []), ...(b.read || [])])].slice(-500);
  out.updated = Math.max(a.updated || 0, b.updated || 0);
  return out;
}

export function exportJson() { return JSON.stringify(state, null, 2); }
export function importJson(text) {
  const obj = JSON.parse(text);
  if (!obj || typeof obj !== "object" || obj.v !== 1 || typeof obj.completed !== "object") throw new Error("Not a valid progress file");
  replace(merge(state, obj)); return true;
}
export function reset() { state = blank(); persist(); }
