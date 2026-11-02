import { setAllowlist } from "./safe.js";
import { h } from "./safe.js";
import * as store from "./store.js";
import * as sync from "./sync.js";
import * as V from "./views.js";

const get = async (f) => { const r = await fetch(`data/${f}`, { cache: "no-cache" }); if (!r.ok) throw new Error(f); return r.json(); };
const main = document.getElementById("main");
let D = {};

function applyTheme() { const t = store.get().settings.theme; const dark = t === "dark" || (t === "auto" && matchMedia("(prefers-color-scheme: dark)").matches); document.documentElement.dataset.theme = dark ? "dark" : "light"; }

function render() {
  const [, route = "", arg] = location.hash.replace(/^#\/?/, "/").split("/");
  const again = () => render();
  let view;
  try {
    view = route === "" ? V.dashboard(D) : route === "learn" ? V.learnIndex(D) : route === "track" ? V.trackView(D, arg)
      : route === "lesson" ? V.lessonView(D, arg, again) : route === "news" ? V.newsView(D) : route === "resources" ? V.resourcesView(D)
      : route === "account" ? V.accountView(D, again) : V.notFound();
  } catch (e) { console.error(e); view = h("p", {}, "Something went wrong rendering this page."); }
  main.replaceChildren(view);
  document.querySelectorAll("nav a[data-r]").forEach((a) => a.setAttribute("aria-current", a.dataset.r === (route === "track" || route === "lesson" ? "learn" : route) ? "page" : "false"));
  document.title = "learnCSinSimple";
  window.scrollTo(0, 0); main.focus({ preventScroll: true });
}

async function boot() {
  store.load(); applyTheme();
  document.getElementById("theme").addEventListener("click", () => { const dark = document.documentElement.dataset.theme === "dark"; store.setSetting("theme", dark ? "light" : "dark"); applyTheme(); });
  try {
    const [allow, cur, res] = await Promise.all([get("allowed-domains.json"), get("curriculum.json"), get("resources.json")]);
    setAllowlist(allow); D = { cur, res, news: await get("news.json").catch(() => ({ items: [], trending: [] })) };
  } catch (e) { main.replaceChildren(h("p", {}, "Could not load site data. Please refresh.")); return; }
  const xpEl = document.getElementById("xp"), update = () => { const s = store.get(), lv = store.levelFor(store.totalXp(s)); xpEl.textContent = `🔥 ${store.streak(s)} · Lv ${lv.level}`; };
  store.subscribe(update); update();
  let t, busy = false; store.subscribe(() => { if (busy || !sync.enabled() || !sync.user()) return; clearTimeout(t); t = setTimeout(async () => { busy = true; try { await sync.syncNow(); } catch {} busy = false; }, 3000); });
  addEventListener("hashchange", render); render();
  if (sync.enabled() && sync.user()) sync.syncNow().then(render).catch(() => {});
}
boot();
