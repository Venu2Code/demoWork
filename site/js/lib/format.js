export const inr = (n, d = 0) => (Number.isFinite(n) ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: d, maximumFractionDigits: d }).format(n) : "–");
export const pct = (n, d = 1) => (Number.isFinite(n) ? `${n >= 0 ? "+" : ""}${n.toFixed(d)}%` : "–");
const opt = { timeZone: "Asia/Kolkata" };
export const timeIST = (iso) => new Intl.DateTimeFormat("en-IN", { ...opt, hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date(iso)) + " IST";
export const dateIST = (iso, o = { day: "numeric", month: "short", year: "numeric" }) => new Intl.DateTimeFormat("en-IN", { ...opt, ...o }).format(new Date(iso));
export const dateTimeIST = (iso) => `${dateIST(iso, { day: "numeric", month: "short" })}, ${timeIST(iso)}`;
