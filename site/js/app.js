import { h, setAllowlist } from "./safe.js";
import { skeleton, notice, empty } from "./ui.js";
import * as api from "./api.js";
import * as auth from "./auth.js";
import { todayView } from "./views/today.js";
import { chartsView } from "./views/charts.js";
import { myGoldView } from "./views/mygold.js";
import { aboutView } from "./views/about.js";

const main = document.getElementById("main");
let token = 0;

const ROUTES = {
  "": () => todayView(),
  charts: () => chartsView(),
  "my-gold": () => myGoldView(render),
  about: () => aboutView(),
};

async function render() {
  const route = location.hash.replace(/^#\/?/, "").split("/")[0], mine = ++token;
  document.querySelectorAll("nav a[data-r]").forEach((a) => a.setAttribute("aria-current", a.dataset.r === route ? "page" : "false"));
  const view = ROUTES[route] ?? ROUTES[""];
  if (!api.configured() && route !== "about") { main.replaceChildren(empty("Setup needed", "The database is not connected yet. Follow the README to create the Supabase project and add its public URL and key to site/js/config.js.")); return; }
  main.replaceChildren(skeleton());
  try {
    const el = await view();
    if (mine !== token) return;                       // a newer navigation won
    main.replaceChildren(el); window.scrollTo(0, 0);
  } catch (e) {
    console.error(e);
    if (mine === token) main.replaceChildren(notice("bad", h("b", {}, "We couldn't load the latest data. "), "To avoid showing wrong information, we show nothing rather than guess. Please try again in a minute."));
  }
}

function theme() {
  const saved = (() => { try { return localStorage.getItem("gt.theme"); } catch { return null; } })();
  const dark = saved ? saved === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}
document.getElementById("theme").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next; try { localStorage.setItem("gt.theme", next); } catch { /* ignore */ }
});

(async function boot() {
  theme();
  try { setAllowlist(await (await fetch("data/allowed-domains.json", { cache: "no-cache" })).json()); } catch { /* links render as plain text if the list can't load */ }
  await api.initSettings();
  auth.onChange(() => { if (location.hash.startsWith("#/my-gold")) render(); });
  addEventListener("hashchange", render);
  render();
})();
