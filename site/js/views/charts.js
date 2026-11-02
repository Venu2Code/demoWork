import { h } from "../safe.js";
import { card, chip, notice, empty } from "../ui.js";
import * as api from "../api.js";
import { lineChart } from "../chart.js";
import { inr, pct, dateIST } from "../lib/format.js";

const ITEMS = [["Gold 24K", "gold", 24], ["Gold 22K", "gold", 22], ["Gold 18K", "gold", 18], ["Silver", "silver", 999]];
const RANGES = [["1M", 31], ["3M", 92], ["6M", 183], ["1Y", 366], ["3Y", 1096], ["All", 99999]];

export async function chartsView() {
  let item = ITEMS[0], days = 366, series = [];
  const out = h("div", { class: "chartbox" }), stats = h("div", { class: "stats" });
  const draw = () => {
    const from = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10), pts = series.filter((r) => r.day >= from).map((r) => ({ ...r, close: Number(r.close), high: Number(r.high), low: Number(r.low) }));
    if (pts.length < 2) { out.replaceChildren(h("p", { class: "muted" }, "No data for this range yet.")); stats.replaceChildren(); return; }
    const closes = pts.map((p) => p.close), hi = Math.max(...pts.map((p) => p.high)), lo = Math.min(...pts.map((p) => p.low)), first = pts[0], last = pts.at(-1);
    out.replaceChildren(lineChart(pts, { label: `${item[0]} price per gram, ${first.day} to ${last.day}` }));
    const stat = (k, v, cls = "") => h("div", { class: `stat ${cls}` }, h("small", {}, k), h("b", {}, v));
    const ch = last.close - first.close;
    stats.replaceChildren(stat("Latest", inr(last.close)), stat("Change over period", `${pct((ch / first.close) * 100, 1)} (${inr(ch)})`, ch >= 0 ? "up" : "down"), stat("Highest", inr(hi)), stat("Lowest", inr(lo)), stat("Average", inr(closes.reduce((a, b) => a + b, 0) / closes.length)), stat("History from", dateIST(series[0].day)));
  };
  const load = async () => { out.replaceChildren(h("p", { class: "muted" }, "Loading…")); try { series = await api.loadSeries(item[1], item[2]); } catch { out.replaceChildren(notice("warn", "Couldn't load the price history.")); return; } draw(); };
  const itemBtns = h("div", { class: "seg", role: "group", "aria-label": "Metal" }, ITEMS.map((it, i) => h("button", { type: "button", class: i === 0 ? "on" : "", onclick: (e) => { item = it; itemBtns.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === e.currentTarget)); load(); } }, it[0])));
  const rangeBtns = h("div", { class: "seg", role: "group", "aria-label": "Period" }, RANGES.map(([n, d]) => h("button", { type: "button", class: d === 366 ? "on" : "", onclick: (e) => { days = d; rangeBtns.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === e.currentTarget)); draw(); } }, n)));
  await load();
  if (!series.length) return empty("No history yet", "Run the history backfill (see the README) to load 3 years of prices.");
  const estimated = series.some((r) => r.is_estimate);
  return h("div", {}, h("h1", {}, "Price history"), h("p", { class: "muted" }, "Price per gram in ₹, daily."),
    card("controls", itemBtns, rangeBtns), card("chartcard", out, stats),
    estimated ? notice("info", h("b", {}, "Estimated history. "), "Older days are calculated from the international price, the official USD→INR rate and Indian import duty, so they can differ from the rate your jeweller showed that day.") : null,
    series.length < 1000 ? notice("warn", `Only ${series.length} days of history are available so far (target: 3 years).`) : null);
}
