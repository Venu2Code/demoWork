import { h, extLink } from "./safe.js";
import * as store from "./store.js";
import * as sync from "./sync.js";
import { SUPABASE_URL } from "./config.js";

const ICON = { hardware: "🖥️", programming: "💻", networking: "🌐", ai: "🧠", cloud: "☁️", security: "🛡️", industry: "📰" };
const LEVEL = { 1: "Foundations", 2: "Intermediate", 3: "Advanced" };
const lnk = (href, ...kids) => h("a", { href }, ...kids);
const bar = (pct, cls = "") => { const f = h("span", { class: "bar-fill" }); f.style.width = `${Math.max(0, Math.min(100, pct))}%`; return h("div", { class: `bar ${cls}`, role: "progressbar", "aria-valuenow": pct, "aria-valuemin": 0, "aria-valuemax": 100 }, f); };
const section = (title, ...kids) => h("section", { class: "block" }, h("h2", {}, title), ...kids);
const agoDays = (iso) => { const d = Math.floor((Date.now() - new Date(iso)) / 864e5); return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`; };

function ring(done, goal) {
  const pct = Math.min(1, done / Math.max(1, goal)), C = 2 * Math.PI * 42;
  const ns = "http://www.w3.org/2000/svg", s = document.createElementNS(ns, "svg");
  s.setAttribute("viewBox", "0 0 100 100"); s.setAttribute("class", "ring"); s.setAttribute("role", "img"); s.setAttribute("aria-label", `${done} of ${goal} lessons today`);
  for (const [cls, off] of [["ring-bg", 0], ["ring-fg", C * (1 - pct)]]) { const c = document.createElementNS(ns, "circle"); c.setAttribute("cx", 50); c.setAttribute("cy", 50); c.setAttribute("r", 42); c.setAttribute("class", cls); c.setAttribute("stroke-dasharray", C); c.setAttribute("stroke-dashoffset", off); s.append(c); }
  const t = document.createElementNS(ns, "text"); t.setAttribute("x", 50); t.setAttribute("y", 56); t.setAttribute("text-anchor", "middle"); t.setAttribute("class", "ring-text"); t.textContent = `${done}/${goal}`; s.append(t);
  return s;
}

function heatmap(s) {
  const cells = [], now = new Date(); now.setUTCHours(0, 0, 0, 0);
  const start = new Date(now); start.setUTCDate(start.getUTCDate() - (7 * 15 - 1) - ((start.getUTCDay() + 6) % 7));
  for (let d = new Date(start); d <= now; d.setUTCDate(d.getUTCDate() + 1)) {
    const k = store.today(d), a = s.activity[k], n = a ? (a.lessons || 0) * 2 + (a.news || 0) : 0;
    cells.push(h("i", { class: `cell l${n === 0 ? 0 : n < 2 ? 1 : n < 4 ? 2 : 3}`, title: `${k}: ${a?.lessons || 0} lessons, ${a?.news || 0} articles` }));
  }
  return h("div", { class: "heatmap", role: "img", "aria-label": "Activity over the last 15 weeks" }, cells);
}

export function dashboard({ cur, news }) {
  const s = store.get(), xp = store.totalXp(s), lv = store.levelFor(xp), st = store.streak(s);
  const doneToday = s.activity[store.today()]?.lessons || 0;
  const next = cur.lessons.find((l) => !s.completed[l.id]);
  const completed = Object.keys(s.completed).length;
  const hero = h("div", { class: "hero" },
    h("div", { class: "hero-text" },
      h("p", { class: "eyebrow" }, st > 0 ? `🔥 ${st}-day streak` : "Start your streak today"),
      h("h1", {}, completed ? "Welcome back. Keep compounding." : "Become an expert in AI & software engineering."),
      h("p", { class: "lead" }, "Bite-sized lessons from hardware to cloud, plus a daily feed of what changed in tech. 20 minutes a day beats 6 hours on Sunday."),
      next ? h("a", { class: "btn primary", href: `#/lesson/${next.id}` }, completed ? "Continue: " : "Start: ", next.title) : h("p", {}, "🎉 You finished every lesson. Check back as new ones are added.")),
    h("div", { class: "hero-stats" },
      h("div", { class: "stat" }, ring(doneToday, s.settings.goal), h("span", {}, "Daily goal")),
      h("div", { class: "stat" }, h("strong", { class: "big" }, `Lv ${lv.level}`), bar(Math.round((lv.into / lv.need) * 100), "xp"), h("span", {}, `${xp} XP · ${lv.need - lv.into} to next`))));

  const tracks = h("div", { class: "grid tracks" }, cur.tracks.map((t) => {
    const p = store.trackProgress(s, cur.lessons, t.id);
    return h("a", { class: `card track c-${t.color}`, href: `#/track/${t.id}` }, h("div", { class: "emoji" }, ICON[t.id]), h("h3", {}, t.name), h("p", {}, t.tagline), bar(p.pct), h("small", {}, `${p.done}/${p.total} lessons · ${p.pct}%`));
  }));

  const fresh = (news?.items || []).slice(0, 3);
  const newsBlock = h("div", { class: "grid news-mini" }, fresh.length ? fresh.map(newsCard) : h("p", { class: "muted" }, "The first daily update will appear here after the scheduled job runs. See README → Daily updates."));

  const badges = h("div", { class: "badges" }, store.BADGES.map((b) => { const got = b.test(s, cur.lessons); return h("div", { class: `badge ${got ? "on" : ""}`, title: b.desc }, h("span", {}, got ? "🏅" : "🔒"), h("b", {}, b.name), h("small", {}, b.desc)); }));

  return h("div", {}, hero,
    section("Your tracks", tracks),
    section("Fresh today", newsBlock, h("p", {}, lnk("#/news", "See all updates →"))),
    section("Consistency", heatmap(s), h("p", { class: "muted" }, `${completed} lessons completed · ${s.read.length} articles read`)),
    section("Badges", badges));
}

export function trackView({ cur }, id) {
  const t = cur.tracks.find((x) => x.id === id); if (!t) return notFound();
  const s = store.get(), p = store.trackProgress(s, cur.lessons, id);
  return h("div", {}, h("a", { href: "#/learn", class: "back" }, "← All tracks"),
    h("div", { class: `track-head c-${t.color}` }, h("div", { class: "emoji big" }, ICON[id]), h("div", {}, h("h1", {}, t.name), h("p", { class: "lead" }, t.tagline), bar(p.pct), h("small", {}, `${p.done}/${p.total} complete`))),
    [1, 2, 3].map((lvl) => section(`Level ${lvl} · ${LEVEL[lvl]}`, h("div", { class: "lessons" }, cur.lessons.filter((l) => l.track === id && l.level === lvl).map((l) => lessonRow(l, s)))))); 
}
const lessonRow = (l, s) => lnk(`#/lesson/${l.id}`, h("div", { class: `lesson-row ${s.completed[l.id] ? "done" : ""}` }, h("span", { class: "check" }, s.completed[l.id] ? "✓" : "○"), h("div", {}, h("b", {}, l.title), h("small", {}, `${l.minutes} min · +${store.xpFor(l)} XP`)), h("span", { class: "go" }, "→")));

export function learnIndex({ cur }) {
  const s = store.get();
  return h("div", {}, h("h1", {}, "Learning paths"), h("p", { class: "lead" }, "Pick a track. Every track runs from foundations to advanced, and new material is added continuously."),
    h("div", { class: "grid tracks" }, cur.tracks.map((t) => { const p = store.trackProgress(s, cur.lessons, t.id); return h("a", { class: `card track c-${t.color}`, href: `#/track/${t.id}` }, h("div", { class: "emoji" }, ICON[t.id]), h("h3", {}, t.name), h("p", {}, t.tagline), bar(p.pct), h("small", {}, `${p.done}/${p.total} lessons`)); })));
}

export function lessonView({ cur }, id, rerender) {
  const l = cur.lessons.find((x) => x.id === id); if (!l) return notFound();
  const s = store.get(), t = cur.tracks.find((x) => x.id === l.track), done = s.completed[l.id];
  const idx = cur.lessons.indexOf(l), nextL = cur.lessons.filter((x) => x.track === l.track)[l.order];
  let picked = null;
  const result = h("p", { class: "quiz-result", "aria-live": "polite" });
  const opts = l.quiz.options.map((o, i) => h("button", { class: "opt", type: "button", onclick: (e) => {
    if (picked !== null) return; picked = i;
    const ok = i === l.quiz.answer; e.currentTarget.classList.add(ok ? "ok" : "bad");
    opts[l.quiz.answer].classList.add("ok"); result.textContent = ok ? "Correct! +5 bonus XP when you complete the lesson." : "Not quite: the highlighted answer is correct. Re-read the key points.";
  } }, o));
  const complete = h("button", { class: "btn primary", type: "button", onclick: () => { const xp = store.completeLesson(l, picked === l.quiz.answer); if (xp) toast(`+${xp} XP · lesson complete!`); rerender(); } }, done ? "✓ Completed" : "Mark complete");
  if (done) complete.disabled = true;
  const note = h("textarea", { rows: 4, placeholder: "Your notes (saved on this device, synced if you sign in)", "aria-label": "Lesson notes", maxlength: 4000 }); note.value = s.notes[l.id] || "";
  note.addEventListener("input", () => store.setNote(l.id, note.value));
  return h("div", { class: "lesson" }, h("a", { href: `#/track/${l.track}`, class: "back" }, `← ${t.name}`),
    h("p", { class: "eyebrow" }, `${LEVEL[l.level]} · ${l.minutes} min · +${store.xpFor(l)} XP`), h("h1", {}, l.title), h("p", { class: "lead" }, l.summary),
    section("Key ideas", h("ul", { class: "points" }, l.points.map((p) => h("li", {}, p)))),
    section("Study materials", h("ul", { class: "res" }, l.resources.map((r) => h("li", {}, extLink(r.url, r.title))))),
    section("Check yourself", h("p", { class: "q" }, l.quiz.q), h("div", { class: "opts" }, opts), result),
    section("Notes", note),
    h("div", { class: "actions" }, complete, done ? h("button", { class: "btn", type: "button", onclick: () => { store.uncompleteLesson(l.id); rerender(); } }, "Undo") : null, nextL ? lnk(`#/lesson/${nextL.id}`, h("span", { class: "btn" }, "Next lesson →")) : null));
}

function newsCard(i) {
  const s = store.get(), saved = s.bookmarks.includes(i.id);
  return h("article", { class: `card news cat-${i.category}` },
    h("div", { class: "meta" }, h("span", { class: "chip" }, `${ICON[i.category] || ""} ${i.category}`), h("span", { class: "muted" }, `${i.source}${i.published ? " · " + i.published : ""}`)),
    h("h3", {}, extLink(i.url, i.title, "news-link")), h("p", {}, i.summary), i.why_it_matters ? h("p", { class: "why" }, h("b", {}, "Why it matters: "), i.why_it_matters) : null,
    h("div", { class: "tags" }, (i.tags || []).map((t) => h("span", { class: "tag" }, "#" + t)),
      h("button", { class: "mini", type: "button", "aria-pressed": saved, onclick: (e) => { store.toggleBookmark(i.id); e.currentTarget.setAttribute("aria-pressed", String(!saved)); e.currentTarget.textContent = saved ? "☆ Save" : "★ Saved"; } }, saved ? "★ Saved" : "☆ Save"),
      h("button", { class: "mini", type: "button", onclick: (e) => { store.markRead(i.id); e.currentTarget.textContent = "✓ Read"; e.currentTarget.disabled = true; } }, s.read.includes(i.id) ? "✓ Read" : "Mark read")));
}

export function newsView({ news }) {
  const items = news?.items || [];
  let cat = "all", q = "", savedOnly = false;
  const list = h("div", { class: "grid news-grid" });
  const draw = () => {
    const s = store.get();
    const f = items.filter((i) => (cat === "all" || i.category === cat) && (!savedOnly || s.bookmarks.includes(i.id)) && (!q || (i.title + i.summary + i.tags.join(" ")).toLowerCase().includes(q)));
    list.replaceChildren(...(f.length ? f.map(newsCard) : [h("p", { class: "muted" }, items.length ? "Nothing matches your filters." : "No updates yet. The daily job will fill this feed.")]));
  };
  const cats = ["all", "ai", "programming", "cloud", "networking", "hardware", "security", "industry"];
  const chips = h("div", { class: "filters", role: "group", "aria-label": "Filter by category" }, cats.map((c) => h("button", { class: `chip btn-chip ${c === "all" ? "on" : ""}`, type: "button", onclick: (e) => { cat = c; chips.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === e.currentTarget)); draw(); } }, c)));
  const search = h("input", { type: "search", placeholder: "Search updates…", "aria-label": "Search updates", oninput: (e) => { q = e.target.value.toLowerCase(); draw(); } });
  const saved = h("label", { class: "chk" }, h("input", { type: "checkbox", onchange: (e) => { savedOnly = e.target.checked; draw(); } }), " Saved only");
  draw();
  const trending = (news?.trending || []).length ? section("Trending: add these to your study plan", h("div", { class: "grid trend" }, news.trending.map((t) => h("div", { class: "card trend" }, h("b", {}, `${ICON[t.track]} ${t.topic}`), h("p", {}, t.why))))) : null;
  return h("div", {}, h("h1", {}, "What's new in tech"), h("p", { class: "lead" }, news?.updated ? `Curated daily by Claude from trusted sources only. Last update ${agoDays(news.updated)}.` : "Curated daily by Claude from trusted sources only."),
    trending, h("div", { class: "toolbar" }, search, saved), chips, list);
}

export function resourcesView({ res }) {
  let track = "all", q = "";
  const list = h("div", { class: "grid res-grid" });
  const draw = () => list.replaceChildren(...res.resources.filter((r) => (track === "all" || r.track === track) && (!q || (r.title + r.desc).toLowerCase().includes(q))).map((r) =>
    h("article", { class: "card" }, h("div", { class: "meta" }, h("span", { class: "chip" }, `${ICON[r.track]} ${r.track}`), h("span", { class: "chip alt" }, r.type), h("span", { class: "muted" }, r.level)), h("h3", {}, extLink(r.url, r.title)), h("p", {}, r.desc))));
  draw();
  const chips = h("div", { class: "filters" }, ["all", "hardware", "programming", "networking", "ai", "cloud"].map((c) => h("button", { class: `chip btn-chip ${c === "all" ? "on" : ""}`, type: "button", onclick: (e) => { track = c; chips.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === e.currentTarget)); draw(); } }, c)));
  return h("div", {}, h("h1", {}, "Resource library"), h("p", { class: "lead" }, "Hand-picked, free-to-start material from trusted sources only."), h("div", { class: "toolbar" }, h("input", { type: "search", placeholder: "Search resources…", "aria-label": "Search resources", oninput: (e) => { q = e.target.value.toLowerCase(); draw(); } })), chips, list);
}

export function accountView({ cur }, rerender) {
  const s = store.get(), msg = h("p", { class: "muted", "aria-live": "polite" });
  const say = (t) => { msg.textContent = t; };
  const goal = h("select", { "aria-label": "Daily lesson goal", onchange: (e) => { store.setSetting("goal", Number(e.target.value)); say("Goal saved."); } }, [1, 2, 3, 4].map((n) => h("option", { value: n, selected: n === s.settings.goal }, `${n} lesson${n > 1 ? "s" : ""} / day`)));
  const file = h("input", { type: "file", accept: "application/json", "aria-label": "Import progress file", onchange: async (e) => { try { store.importJson(await e.target.files[0].text()); say("Imported and merged."); rerender(); } catch (err) { say("Import failed: " + err.message); } } });
  const cloud = !sync.enabled() ? h("p", { class: "muted" }, "Cloud sync is not configured. Progress is stored in this browser. See README → Supabase to enable accounts.")
    : sync.user() ? h("div", {}, h("p", {}, `Signed in as ${sync.user().email}`), h("button", { class: "btn primary", type: "button", onclick: async () => { try { await sync.syncNow(); say("Synced at " + new Date().toLocaleTimeString()); rerender(); } catch (e) { say("Sync failed: " + e.message); } } }, "Sync now"), " ", h("button", { class: "btn", type: "button", onclick: () => { sync.signOut(); rerender(); } }, "Sign out"))
    : (() => { const em = h("input", { type: "email", placeholder: "you@example.com", autocomplete: "email", required: true, "aria-label": "Email" }), pw = h("input", { type: "password", placeholder: "Password (min 8)", autocomplete: "current-password", minlength: 8, required: true, "aria-label": "Password" });
        const go = (fn) => async () => { try { const r = await fn(em.value.trim(), pw.value); if (r === "confirm-email") say("Check your email to confirm, then sign in."); else { await sync.syncNow(); rerender(); } } catch (e) { say(e.message); } };
        return h("div", { class: "form" }, em, pw, h("div", {}, h("button", { class: "btn primary", type: "button", onclick: go(sync.signIn) }, "Sign in"), " ", h("button", { class: "btn", type: "button", onclick: go(sync.signUp) }, "Create account"))); })();
  const dl = () => { const a = h("a", { href: URL.createObjectURL(new Blob([store.exportJson()], { type: "application/json" })), download: "learncsinsimple-progress.json" }); document.body.append(a); a.click(); a.remove(); };
  return h("div", {}, h("h1", {}, "Profile & data"),
    section("Daily goal", goal),
    section("Cloud sync", cloud, SUPABASE_URL ? null : null),
    section("Backup", h("button", { class: "btn", type: "button", onclick: dl }, "Export progress"), " ", file),
    section("Danger zone", h("button", { class: "btn danger", type: "button", onclick: () => { if (confirm("Erase all progress on this device?")) { store.reset(); rerender(); } } }, "Reset progress")), msg);
}

export const notFound = () => h("div", {}, h("h1", {}, "Page not found"), lnk("#/", "Go home"));
export function toast(text) { const t = h("div", { class: "toast", role: "status" }, text); document.body.append(t); setTimeout(() => t.remove(), 3000); }
