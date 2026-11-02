// Safe DOM building: no innerHTML anywhere. Untrusted text only ever goes through textContent.
export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "text") el.textContent = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}

let ALLOW = null;
export const setAllowlist = (l) => { ALLOW = l; };
const match = (host, d) => host === d || host.endsWith("." + d);

/** Returns a safe https URL string or null. Mirrors scripts/lib/content.mjs#isAllowedUrl. */
export function safeUrl(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password || !ALLOW) return null;
    const host = u.hostname.toLowerCase();
    if (ALLOW.blocked.some((d) => match(host, d))) return null;
    return ALLOW.allowed.some((d) => match(host, d)) ? u.href : null;
  } catch { return null; }
}

export function extLink(url, label, cls = "") {
  const safe = safeUrl(url);
  if (!safe) return h("span", { class: "link-blocked", title: "Blocked: source is not on the trusted list" }, label, " (blocked)");
  return h("a", { href: safe, target: "_blank", rel: "noopener noreferrer nofollow", class: cls }, label, h("span", { class: "sr" }, " (opens in a new tab)"));
}
