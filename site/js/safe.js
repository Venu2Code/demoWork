// Safe DOM building: no innerHTML anywhere. Untrusted text only ever goes through textContent.
export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat(2)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}
const NS = "http://www.w3.org/2000/svg";
export function s(tag, props = {}, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(props)) if (v != null) el.setAttribute(k, v);
  for (const kid of kids.flat(2)) if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}

let ALLOW = null;
export const setAllowlist = (l) => { ALLOW = l; };
const match = (host, d) => host === d || host.endsWith("." + d);
/** https URL on the trusted list, else null. Mirrors scripts/lib/common.mjs#isAllowedUrl. */
export function safeUrl(raw) {
  try {
    const u = new URL(raw); if (u.protocol !== "https:" || u.username || u.password || !ALLOW) return null;
    const host = u.hostname.toLowerCase();
    return !ALLOW.blocked.some((d) => match(host, d)) && ALLOW.allowed.some((d) => match(host, d)) ? u.href : null;
  } catch { return null; }
}
export function extLink(url, label) {
  const ok = safeUrl(url);
  return ok ? h("a", { href: ok, target: "_blank", rel: "noopener noreferrer nofollow" }, label) : h("span", {}, label);
}
