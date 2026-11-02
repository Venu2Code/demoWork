// Dependency-free SVG line chart with a hover read-out. Every point shows date + close + day high/low.
import { s, h } from "./safe.js";
import { inr } from "./lib/format.js";

export function lineChart(points, { label = "Price chart", estimateUntil = null } = {}) {
  const W = 920, H = 340, m = { l: 74, r: 16, t: 34, b: 30 }, n = points.length;
  const wrap = h("div", { class: "chart" });
  if (n < 2) return h("p", { class: "muted" }, "Not enough data to draw a chart yet.");
  const lo0 = Math.min(...points.map((p) => p.low ?? p.close)), hi0 = Math.max(...points.map((p) => p.high ?? p.close));
  const pad = (hi0 - lo0) * 0.06 || hi0 * 0.01, lo = lo0 - pad, hi = hi0 + pad;
  const X = (i) => m.l + (i / (n - 1)) * (W - m.l - m.r), Y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);
  const line = points.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(p.close).toFixed(1)}`).join("");
  const area = `${line}L${X(n - 1).toFixed(1)},${H - m.b}L${X(0).toFixed(1)},${H - m.b}Z`;
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": label, class: "chart-svg" });
  svg.append(s("defs", {}, s("linearGradient", { id: "g", x1: 0, y1: 0, x2: 0, y2: 1 }, s("stop", { offset: "0%", class: "st1" }), s("stop", { offset: "100%", class: "st2" }))));
  for (let i = 0; i <= 4; i++) { const v = lo + ((hi - lo) * i) / 4, y = Y(v); svg.append(s("line", { x1: m.l, x2: W - m.r, y1: y, y2: y, class: "grid" }), s("text", { x: m.l - 8, y: y + 4, class: "axis", "text-anchor": "end" }, inr(v))); }
  const fmt = new Intl.DateTimeFormat("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });
  for (let i = 0; i <= 4; i++) { const k = Math.round((i * (n - 1)) / 4); svg.append(s("text", { x: X(k), y: H - 8, class: "axis", "text-anchor": i === 0 ? "start" : i === 4 ? "end" : "middle" }, fmt.format(new Date(points[k].day)))); }
  svg.append(s("path", { d: area, fill: "url(#g)" }), s("path", { d: line, class: "line", fill: "none" }));
  const cross = s("line", { class: "cross", y1: m.t, y2: H - m.b, x1: 0, x2: 0, visibility: "hidden" }), dot = s("circle", { r: 5, class: "dot", visibility: "hidden" });
  const info = s("text", { x: m.l, y: 18, class: "info" }, "Hover or touch the chart for daily values");
  const hit = s("rect", { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: "transparent" });
  const show = (ev) => {
    const r = svg.getBoundingClientRect(); const px = ((ev.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(n - 1, Math.round(((px - m.l) / (W - m.l - m.r)) * (n - 1)))), p = points[i];
    cross.setAttribute("x1", X(i)); cross.setAttribute("x2", X(i)); dot.setAttribute("cx", X(i)); dot.setAttribute("cy", Y(p.close));
    cross.setAttribute("visibility", "visible"); dot.setAttribute("visibility", "visible");
    const est = p.is_estimate ? " (estimate)" : "";
    info.textContent = `${new Date(p.day).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}: ${inr(p.close)}${est}  ·  high ${inr(p.high)}  low ${inr(p.low)}`;
  };
  hit.addEventListener("pointermove", show); hit.addEventListener("pointerdown", show);
  svg.append(cross, dot, info, hit); wrap.append(svg);
  return wrap;
}
