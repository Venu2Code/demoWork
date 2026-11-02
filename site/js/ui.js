import { h, s } from "./safe.js";
export const card = (cls, ...k) => h("section", { class: `card ${cls || ""}` }, ...k);
export const chip = (text, cls = "") => h("span", { class: `chip ${cls}` }, text);
export const notice = (kind, ...k) => h("div", { class: `notice ${kind}`, role: kind === "warn" || kind === "bad" ? "alert" : "note" }, ...k);
export const skeleton = () => h("div", { class: "skeleton", "aria-busy": "true", "aria-label": "Loading" }, h("i"), h("i"), h("i"));
export const sign = (n) => (n > 0 ? "up" : n < 0 ? "down" : "flat");
export const arrow = (n) => (n > 0 ? "▲" : n < 0 ? "▼" : "■");

/** Horizontal meter: `value` 0..100 positions the pointer; `zones` = "buy" (gradient red->green) or "sell" (green->gold). */
export function meter(value, kind = "buy", label = "") {
  const ptr = h("span", { class: "ptr" }); ptr.style.left = `${Math.max(0, Math.min(100, value))}%`;
  return h("div", { class: `meter ${kind}`, role: "meter", "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": Math.round(value), "aria-label": label }, h("div", { class: "track" }), ptr);
}
export function bar(pct) { const f = h("span"); f.style.width = `${Math.max(0, Math.min(100, pct))}%`; return h("div", { class: "bar" }, f); }
export function empty(title, text) { return h("div", { class: "empty" }, h("h2", {}, title), h("p", {}, text)); }
