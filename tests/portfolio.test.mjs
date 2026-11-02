import test from "node:test";
import assert from "node:assert/strict";
import { evaluateLot, summarize, validatePurchase, rateFor } from "../site/js/lib/portfolio.js";

const latest = { gold: { 24: 12000, 22: 11000, 18: 9000 }, silver: { 999: 150 } };
const lot = (o = {}) => ({ id: "1", metal: "gold", purity: 22, grams: 10, total_paid: 100000, ...o });

test("profit/loss uses what was PAID (incl. GST+charges) vs value at today's rate", () => {
  const e = evaluateLot(lot(), latest);                 // value 10 * 11000 = 110000
  assert.equal(e.value, 110000); assert.equal(e.profit, 10000); assert.ok(Math.abs(e.gainPct - 10) < 1e-9);
  assert.equal(e.sell.zone, "hold");
});
test("50% gain triggers the sell zone; loss never does", () => {
  assert.equal(evaluateLot(lot({ total_paid: 73000 }), latest).sell.zone, "sell");   // 110000/73000 = +50.7%
  const loss = evaluateLot(lot({ total_paid: 130000 }), latest);
  assert.ok(loss.profit < 0); assert.equal(loss.sell.zone, "below");
});
test("missing purity is derived from the pure rate; missing metal yields an explicit error", () => {
  assert.ok(Math.abs(rateFor({ gold: { 24: 1000 } }, "gold", 22) - 1000 * 0.916 / 0.999) < 1e-9);
  assert.ok(evaluateLot(lot({ metal: "silver", purity: 999 }), { gold: latest.gold }).error);
});
test("summary totals ignore invalid lots but report them", () => {
  const s = summarize([lot(), lot({ id: "2", metal: "silver", purity: 999, grams: 100, total_paid: 12000 }), lot({ id: "3", grams: 0 })], latest);
  assert.equal(s.cost, 112000); assert.equal(s.value, 110000 + 15000); assert.equal(s.skipped, 1);
  assert.equal(s.grams.gold, 10); assert.equal(s.grams.silver, 100);
});
test("purchase form validation", () => {
  const ok = { metal: "gold", purity: "22", grams: "8.5", total_paid: "60000", purchased_on: "2025-01-15", form: "jewellery", gst_amount: "1700", making_charges: "4000" };
  assert.ok(validatePurchase(ok, "2026-01-01").ok);
  assert.ok(!validatePurchase({ ...ok, grams: "-1" }, "2026-01-01").ok);
  assert.ok(!validatePurchase({ ...ok, purchased_on: "2027-01-01" }, "2026-01-01").ok);
  assert.ok(!validatePurchase({ ...ok, purity: "20" }, "2026-01-01").ok);
  assert.ok(!validatePurchase({ ...ok, gst_amount: "70000" }, "2026-01-01").ok);
  assert.ok(!validatePurchase({ ...ok, metal: "silver", purity: "22" }, "2026-01-01").ok);
});
