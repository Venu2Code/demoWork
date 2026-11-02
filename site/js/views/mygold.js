import { h } from "../safe.js";
import { card, chip, notice, sign, arrow, meter, bar } from "../ui.js";
import * as api from "../api.js";
import * as auth from "../auth.js";
import { inr, pct, dateIST } from "../lib/format.js";
import { summarize, validatePurchase } from "../lib/portfolio.js";
import { SELL_TARGET_PCT } from "../lib/analytics.js";

const PURITIES = { gold: [[24, "24K"], [22, "22K"], [18, "18K"]], silver: [[999, "999 (pure)"], [925, "925 (sterling)"]] };

function signIn(rerender) {
  const email = h("input", { type: "email", autocomplete: "email", required: true, "aria-label": "Email" }), pw = h("input", { type: "password", autocomplete: "current-password", minlength: 12, required: true, "aria-label": "Password" });
  const msg = h("p", { class: "muted", "aria-live": "polite" });
  const go = (fn) => async () => { try { msg.textContent = "Please wait…"; const r = await fn(email.value.trim(), pw.value); if (r === "confirm-email") msg.textContent = "Check your email to confirm your account, then sign in."; else rerender(); } catch (e) { msg.textContent = e.message; } };
  return card("auth", h("h1", {}, "My Gold"), h("p", {}, "Sign in to record your purchases and see whether your savings are in profit or loss. Your records are private to your account: nobody else can read them."),
    h("div", { class: "form" }, h("label", {}, "Email", email), h("label", {}, "Password (12+ characters)", pw), h("div", {}, h("button", { class: "btn primary", type: "button", onclick: go(auth.signIn) }, "Sign in"), " ", h("button", { class: "btn", type: "button", onclick: go(auth.signUp) }, "Create account")), msg));
}

function purchaseForm(onSaved) {
  const f = {}, msg = h("p", { class: "muted", "aria-live": "polite" });
  const input = (name, label, attrs = {}) => { const el = h("input", { name, ...attrs }); f[name] = el; return h("label", {}, label, el); };
  const metal = h("select", { name: "metal" }, h("option", { value: "gold" }, "Gold"), h("option", { value: "silver" }, "Silver"));
  const purity = h("select", { name: "purity" }), form = h("select", { name: "form" }, ["coin", "bar", "jewellery", "digital", "other"].map((x) => h("option", { value: x }, x[0].toUpperCase() + x.slice(1))));
  const fill = () => purity.replaceChildren(...PURITIES[metal.value].map(([v, l]) => h("option", { value: v }, l))); metal.addEventListener("change", fill); fill();
  const today = new Date().toISOString().slice(0, 10);
  const root = h("form", { class: "form grid2", novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    const raw = { metal: metal.value, purity: purity.value, form: form.value, ...Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value])) };
    const v = validatePurchase(raw); if (!v.ok) { msg.textContent = v.errors.join(" "); return; }
    try { msg.textContent = "Saving…"; await api.addPurchase(await auth.token(), v.value); root.reset(); fill(); msg.textContent = "Saved."; onSaved(); } catch (er) { msg.textContent = "Could not save: " + er.message; }
  } },
    h("label", {}, "Metal", metal), h("label", {}, "Purity", purity), h("label", {}, "Form", form),
    input("purchased_on", "Date bought", { type: "date", max: today, required: true }), input("grams", "Weight (grams)", { type: "number", step: "0.001", min: "0.001", inputmode: "decimal", required: true }),
    input("total_paid", "Total paid ₹ (incl. GST & charges)", { type: "number", step: "0.01", min: "1", inputmode: "decimal", required: true }),
    input("gst_amount", "GST amount ₹ (optional)", { type: "number", step: "0.01", min: "0" }), input("making_charges", "Making charges ₹ (optional)", { type: "number", step: "0.01", min: "0" }), input("other_charges", "Other charges ₹ (optional)", { type: "number", step: "0.01", min: "0" }),
    input("notes", "Notes (optional)", { maxlength: 300 }),
    h("div", { class: "full" }, h("button", { class: "btn primary", type: "submit" }, "Save purchase"), msg));
  return card("addform", h("h2", {}, "Record a purchase"), h("p", { class: "muted" }, "Enter what you actually paid, including GST and all charges. That is what your profit or loss is measured against."), root);
}

const csv = (rows) => ["date,metal,purity,form,grams,total_paid,gst,making,other,current_value,profit,gain_pct", ...rows.map((l) => [l.purchased_on, l.metal, l.purity, l.form, l.grams, l.total_paid, l.gst_amount, l.making_charges, l.other_charges, l.value?.toFixed(2) ?? "", l.profit?.toFixed(2) ?? "", l.gainPct?.toFixed(2) ?? ""].join(","))].join("\n");

export async function myGoldView(rerender) {
  if (!api.configured()) return card("auth", h("h1", {}, "My Gold"), notice("warn", "Accounts are not set up yet. The site owner needs to connect the database (see README)."));
  if (!auth.user()) return signIn(rerender);
  let purchases, today;
  try { const tk = await auth.token(); [purchases, today] = await Promise.all([api.listPurchases(tk), api.loadToday()]); } catch (e) { return card("auth", notice("warn", "Couldn't load your records: " + e.message), h("button", { class: "btn", type: "button", onclick: () => { auth.signOut(); rerender(); } }, "Sign out")); }
  const sum = summarize(purchases, today.latest, SELL_TARGET_PCT), root = h("div", {});
  const gain = sum.profit;
  root.append(...[
    h("div", { class: "titlebar split" }, h("div", {}, h("h1", {}, "My Gold"), h("p", { class: "muted" }, `Signed in as ${auth.user().email} · private to you · signs out after 30 min idle`)), h("button", { class: "btn", type: "button", onclick: () => { auth.signOut(); rerender(); } }, "Sign out")),
    sum.sellNow.length ? notice("good", h("b", {}, `${sum.sellNow.length} purchase${sum.sellNow.length > 1 ? "s have" : " has"} reached your +${SELL_TARGET_PCT}% target. `), "Consider selling those. Check the actual buy-back rate and charges with your seller first.") : null,
    purchases.length ? h("div", { class: "prices" },
      card("price", h("small", {}, "Metal you hold"), h("div", { class: "big" }, `${sum.grams.gold.toFixed(2)} g gold`), h("div", {}, `${sum.grams.silver.toFixed(2)} g silver`)),
      card("price", h("small", {}, "You invested (all-in)"), h("div", { class: "big" }, inr(sum.cost))),
      card("price", h("small", {}, "Worth today (est.)"), h("div", { class: "big" }, inr(sum.value))),
      card(`price result ${sign(gain)}`, h("small", {}, gain >= 0 ? "Overall profit" : "Overall loss"), h("div", { class: "big" }, `${arrow(gain)} ${inr(Math.abs(gain))}`), h("div", {}, pct(sum.gainPct, 1)))) : null,
    purchases.length ? notice("info", "Today's value uses the estimated Indian rate for each purity, before any selling charges, so it is a guide, not a buy-back quote.") : null,
    sum.skipped ? notice("warn", `${sum.skipped} purchase(s) could not be valued (missing rate) and are excluded from totals.`) : null,
    purchaseForm(rerender),
    purchases.length ? card("lots", h("div", { class: "head" }, h("h2", {}, "Your purchases"), h("button", { class: "btn", type: "button", onclick: () => { const a = h("a", { href: URL.createObjectURL(new Blob([csv(sum.lots)], { type: "text/csv" })), download: "my-gold.csv" }); document.body.append(a); a.click(); a.remove(); } }, "Export CSV")),
      h("div", { class: "lotlist" }, sum.lots.map((l) => h("article", { class: "lot" },
        h("div", { class: "lothead" }, h("b", {}, `${Number(l.grams).toFixed(2)} g ${l.metal} ${l.metal === "gold" ? l.purity + "K" : l.purity}`), h("small", {}, `${l.form} · bought ${dateIST(l.purchased_on)} · paid ${inr(Number(l.total_paid))}`)),
        l.error ? h("p", { class: "muted" }, l.error) : h("div", {},
          h("div", { class: `delta ${sign(l.profit)}` }, `${arrow(l.profit)} ${inr(Math.abs(l.profit))} (${pct(l.gainPct, 1)}) · worth ${inr(l.value)}`),
          meter(l.sell.progress, "sell", "Progress to sell target"), h("div", { class: "scale" }, h("span", {}, "0%"), h("span", {}, `+${SELL_TARGET_PCT}% target`)), h("p", { class: `verdict ${l.sell.zone}` }, l.sell.label)),
        h("button", { class: "link danger", type: "button", onclick: async () => { if (!confirm("Delete this purchase record?")) return; try { await api.deletePurchase(await auth.token(), l.id); rerender(); } catch (e) { alert("Could not delete: " + e.message); } } }, "Delete"))))) : card("empty", h("p", {}, "No purchases yet. Record your first one above to start tracking."))].filter(Boolean));
  return root;
}
