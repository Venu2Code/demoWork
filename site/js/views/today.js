import { h, extLink } from "../safe.js";
import { card, chip, notice, sign, arrow, meter, empty } from "../ui.js";
import * as api from "../api.js";
import { inr, pct, timeIST, dateIST, dateTimeIST } from "../lib/format.js";
import { staleness } from "../lib/pricing.js";
import { buyMeter } from "../lib/analytics.js";

const ROWS = [["Gold 24K", "gold", 24, "999 · pure"], ["Gold 22K", "gold", 22, "916 · jewellery"], ["Gold 18K", "gold", 18, "750"], ["Silver", "silver", 999, "999 · pure"]];
const IMPACT = { bullish: ["Pushes gold up", "up"], bearish: ["Pushes gold down", "down"], neutral: ["Neutral", "flat"], uncertain: ["Unclear impact", "flat"] };

function newsList(items, none) {
  if (!items.length) return h("p", { class: "muted" }, none);
  return h("ul", { class: "news" }, items.map((n) => h("li", {},
    h("div", { class: "row" }, n.event_time ? chip(timeIST(n.event_time), "time") : null, chip(IMPACT[n.impact][0], IMPACT[n.impact][1])),
    h("b", {}, n.title), h("p", {}, n.summary), h("small", {}, "Source: ", n.url ? extLink(n.url, n.source || "link") : n.source))));
}

function marketWatch(o) {
  const over = o.news.filter((n) => n.kind === "overnight"), startOfToday = new Date(`${o.today}T00:00:00+05:30`).toISOString();
  const up = o.news.filter((n) => n.kind === "upcoming" && n.event_time && n.event_time >= startOfToday);
  return card("watch",
    h("div", { class: "head" }, h("h2", {}, "Market watch"), h("small", {}, "News that can move today's rate · times in IST")),
    h("div", { class: "cols" },
      h("div", {}, h("h3", {}, "Happened overnight"), newsList(over, "No verified overnight events recorded.")),
      h("div", {}, h("h3", {}, "Coming up (today & tomorrow)"), newsList(up, "No scheduled market-moving events recorded."))),
    h("p", { class: "fine" }, "Curated by Claude from a fixed list of trusted sources and checked by code before display. Event times can change; confirm with the source."));
}

function priceCards(d) {
  return h("div", { class: "prices" }, ROWS.map(([name, metal, purity, sub]) => {
    const p = d.latest[metal][purity], prev = d.prev[`${metal}${purity}`]?.close, meta = d.meta[`${metal}${purity}`];
    const delta = p && prev ? p - prev : null, dp = delta != null ? (delta / prev) * 100 : null, dec = metal === "silver" ? 2 : 0;
    return card(`price ${metal}`,
      h("div", { class: "pname" }, h("b", {}, name), h("small", {}, sub)),
      p ? h("div", {},
        h("div", { class: "per" }, h("span", { class: "big" }, inr(p, dec)), h("span", {}, " / gram")),
        h("div", { class: "ten" }, h("b", {}, inr(p * 10)), " / 10 g", metal === "silver" ? h("span", {}, ` · ${inr(p * 1000)} / kg`) : null),
        delta != null ? h("div", { class: `delta ${sign(delta)}` }, `${arrow(delta)} ${inr(Math.abs(delta), dec)} (${pct(dp, 2)}) vs previous close`) : h("div", { class: "delta flat" }, "No previous close yet"),
        h("small", {}, `Updated ${dateTimeIST(meta.observed_at)}`)) : h("p", { class: "muted" }, "No price recorded yet."));
  }));
}

function timeline(d) {
  const by = new Map();
  for (const t of d.ticks) (by.get(t.observed_at) || by.set(t.observed_at, {}).get(t.observed_at))[`${t.metal}${t.purity}`] = Number(t.price_per_gram);
  const rows = [...by].map(([at, v]) => ({ at, ...v }));
  const head = h("div", { class: "head" }, h("h2", {}, "Today's price changes"), h("small", {}, rows.length ? `${rows.length} change${rows.length > 1 ? "s" : ""} recorded today (IST)` : "No change recorded yet today"));
  if (!rows.length) return card("timeline", head, h("p", { class: "muted" }, "Rates are checked every 15 minutes. A new row appears each time the price changes."));
  const newest = rows.slice().reverse();
  return card("timeline", head, h("div", { class: "scroll" }, h("table", {},
    h("thead", {}, h("tr", {}, ["Time", "Gold 24K", "Gold 22K", "Gold 18K", "Silver", "24K move"].map((x) => h("th", { scope: "col" }, x)))),
    h("tbody", {}, newest.map((r, i) => {
      const older = newest[i + 1], dv = older && r.gold24 != null && older.gold24 != null ? r.gold24 - older.gold24 : null;
      return h("tr", {}, h("th", { scope: "row" }, timeIST(r.at)), h("td", {}, inr(r.gold24)), h("td", {}, inr(r.gold22)), h("td", {}, inr(r.gold18)), h("td", {}, inr(r.silver999, 2)),
        h("td", { class: dv == null ? "" : sign(dv) }, dv == null ? "first reading" : `${arrow(dv)} ${inr(Math.abs(dv))}`));
    })))));
}

function forecastCard(o) {
  if (!o.forecasts.length) return card("forecast", h("h2", {}, "Next 3 days"), h("p", { class: "muted" }, "Forecast not available yet. It appears after the daily update runs."));
  const sel = h("select", { "aria-label": "Choose metal" }, ROWS.map(([n, m, p]) => h("option", { value: `${m}|${p}` }, n)));
  const body = h("div", {});
  const draw = () => {
    const [m, p] = sel.value.split("|"), rows = o.forecasts.filter((r) => r.metal === m && String(r.purity) === p).sort((a, b) => a.horizon - b.horizon);
    if (!rows.length) { body.replaceChildren(h("p", { class: "muted" }, "No forecast for this item yet.")); return; }
    const b = Number(rows[0].bias), lean = b > 0.1 ? ["Leaning higher", "up"] : b < -0.1 ? ["Leaning lower", "down"] : ["No clear lean", "flat"];
    body.replaceChildren(
      h("div", { class: "row" }, chip(lean[0], lean[1]), chip(`Confidence: ${rows[0].confidence}`), rows[0].model === "statistical" ? chip("Statistical only (no verified news)") : null),
      h("div", { class: "scroll" }, h("table", {}, h("thead", {}, h("tr", {}, ["Day", "Likely range (80%)", "Middle"].map((x) => h("th", { scope: "col" }, x)))),
        h("tbody", {}, rows.map((r) => {
          const day = new Date(new Date(`${o.today}T12:00:00+05:30`).getTime() + r.horizon * 864e5);
          return h("tr", {}, h("th", { scope: "row" }, dateIST(day, { weekday: "short", day: "numeric", month: "short" })), h("td", {}, `${inr(r.low)} – ${inr(r.high)}`), h("td", {}, inr(r.center)));
        })))),
      rows[0].rationale ? h("p", {}, h("b", {}, "Why: "), rows[0].rationale) : null);
  };
  sel.addEventListener("change", draw); draw();
  return card("forecast", h("div", { class: "head" }, h("h2", {}, "Next 3 days (per gram)"), sel), body,
    h("p", { class: "fine" }, "An estimate, not a promise. The range comes from recent price swings and is nudged slightly by news. Real prices can fall outside it. Not financial advice."));
}

async function meters() {
  const since = new Date(Date.now() - 420 * 864e5).toISOString().slice(0, 10);
  const [g, sv] = await Promise.all([api.loadSeries("gold", 24, since), api.loadSeries("silver", 999, since)]);
  const mk = (name, rows) => {
    const m = buyMeter(rows.map((r) => Number(r.close)));
    return card("meterc", h("h3", {}, name), m ? h("div", {},
      meter(m.score, "buy", `${name} buying conditions`),
      h("div", { class: "scale" }, h("span", {}, "Expensive"), h("span", {}, "Neutral"), h("span", {}, "Favourable")),
      h("p", { class: "verdict" }, h("b", {}, `${m.score}/100`), " · ", m.label),
      h("details", {}, h("summary", {}, "How this is worked out"), h("ul", {}, m.parts.map((p) => h("li", {}, `${p.name}: ${p.value}/100 (${p.note})`))))) : h("p", { class: "muted" }, "Needs at least 60 days of history."));
  };
  return card("meters", h("div", { class: "head" }, h("h2", {}, "Is it a good time to buy?"), h("small", {}, "Based on price history only")),
    h("div", { class: "cols" }, mk("Gold 24K", g), mk("Silver", sv)),
    h("p", { class: "fine" }, "A guide to whether today's price is high or low compared with the past year, to help you buy in steps. It cannot know the future. Track your own holdings and sell signal under ", h("a", { href: "#/my-gold" }, "My Gold"), "."));
}

export async function todayView() {
  const [d, o] = await Promise.all([api.loadToday(), api.loadOutlook().catch(() => ({ today: d_today(), news: [], forecasts: [] }))]);
  if (!Object.keys(d.latest.gold).length) return empty("No prices yet", "The price job has not recorded any rates. See the README to run the first update.");
  const src = d.status.find((x) => x.source === "goldapi.io"), st = staleness(src?.last_checked), root = h("div", {});
  const t24 = d.dailyToday.find((r) => r.metal === "gold" && r.purity === 24);
  root.append(...[
    st.stale ? notice("warn", h("b", {}, "Prices may be out of date. "), src ? `Last successful check was ${dateTimeIST(src.last_checked)}.` : "No successful check recorded.", " Do not rely on these numbers for a purchase.") : null,
    src && !src.last_ok ? notice("warn", "The latest price check was rejected by our data-quality rules, so the previous values are shown.") : null,
    marketWatch(o),
    h("div", { class: "titlebar" }, h("h1", {}, "India gold & silver rate today"), h("p", { class: "muted" }, `${dateIST(new Date(), { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · last checked ${src ? timeIST(src.last_checked) : "–"}`)),
    priceCards(d),
    notice("info", h("b", {}, "These are estimated Indian rates. "), "International price converted to INR plus import duty. Your jeweller's rate, GST (3%) and making charges will differ."),
    t24 ? card("range", h("b", {}, "Today's 24K range: "), `${inr(t24.low)} – ${inr(t24.high)} per gram`) : null,
    timeline(d), forecastCard(o), h("div", { id: "meters" }, h("p", { class: "muted" }, "Loading meters…"))].filter(Boolean));
  meters().then((m) => root.querySelector("#meters")?.replaceWith(m)).catch(() => root.querySelector("#meters")?.replaceWith(notice("warn", "Couldn't load the buying meter.")));
  return root;
}
const d_today = () => new Date().toISOString().slice(0, 10);
