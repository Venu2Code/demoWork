// Clickjacking protection. GitHub Pages cannot send X-Frame-Options / frame-ancestors headers and a <meta> CSP cannot
// carry frame-ancestors, so if this page is loaded inside another page's frame we hide it and try to break out.
// (Hiding is what protects users; the break-out is a bonus and may be blocked by the browser.)
if (window.top !== window.self) {
  document.documentElement.style.display = "none";
  try { window.top.location = window.self.location; } catch { /* cross-origin or sandboxed: stay hidden */ }
}
