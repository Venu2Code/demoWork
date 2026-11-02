import test from "node:test";
import assert from "node:assert/strict";
import { perGram, withIndianAdjustment, validateTicks, staleness, istDay, GRAMS_PER_TROY_OZ } from "../site/js/lib/pricing.js";
import { buildTicks, parseGoldApi } from "../scripts/fetch-live.mjs";

test("per-gram conversion: 1 troy oz in INR / 31.1035 for pure gold; 22k and 18k scale by fineness", () => {
  const oz = 311034.768; // so 24k = exactly 10000/g
  assert.ok(Math.abs(perGram(oz, "gold", 24) - 10000) < 1e-6);
  assert.ok(Math.abs(perGram(oz, "gold", 22) - 10000 * 0.916 / 0.999) < 1e-6);
  assert.ok(Math.abs(perGram(oz, "gold", 18) - 10000 * 0.75 / 0.999) < 1e-6);
  assert.ok(Math.abs(perGram(oz, "silver", 999) - 10000) < 1e-6);
  assert.ok(Math.abs(GRAMS_PER_TROY_OZ - 31.1034768) < 1e-9);
});
test("bad inputs throw instead of producing a number", () => {
  assert.throws(() => perGram(0, "gold", 24));
  assert.throws(() => perGram(100, "gold", 20));
  assert.throws(() => perGram(NaN, "silver", 999));
});
test("Indian adjustment adds duty percent", () => assert.equal(withIndianAdjustment(1000, 6), 1060));

test("tick validation accepts consistent data and rejects bad data", () => {
  const good = [{ metal: "gold", purity: 24, price: 12000 }, { metal: "gold", purity: 22, price: 12000 * 0.916 / 0.999 }, { metal: "gold", purity: 18, price: 12000 * 0.75 / 0.999 }, { metal: "silver", purity: 999, price: 150 }];
  assert.ok(validateTicks(good).ok);
  assert.ok(!validateTicks([{ metal: "gold", purity: 24, price: -5 }]).ok);
  assert.ok(!validateTicks([{ metal: "gold", purity: 24, price: 90 }]).ok, "absurdly low");
  assert.ok(!validateTicks([{ metal: "gold", purity: 24, price: 14000 }], [{ metal: "gold", purity: 24, price: 12000 }]).ok, ">8% jump");
  assert.ok(validateTicks([{ metal: "gold", purity: 24, price: 12500 }], [{ metal: "gold", purity: 24, price: 12000 }]).ok);
  const incons = [{ metal: "gold", purity: 24, price: 12000 }, { metal: "gold", purity: 22, price: 12000 }];
  assert.ok(!validateTicks(incons).ok, "22k cannot equal 24k");
});
test("staleness flags old or missing checks", () => {
  const now = new Date("2026-11-02T10:00:00Z");
  assert.equal(staleness("2026-11-02T09:30:00Z", now).stale, false);
  assert.equal(staleness("2026-11-02T04:00:00Z", now).stale, true);
  assert.equal(staleness(null, now).stale, true);
});
test("IST day rolls over at 18:30 UTC", () => {
  assert.equal(istDay("2026-11-02T18:29:00Z"), "2026-11-02");
  assert.equal(istDay("2026-11-02T18:31:00Z"), "2026-11-03");
});
test("provider parsing + tick building", () => {
  const q = parseGoldApi({ price: 400000, timestamp: 1793000000 });
  assert.equal(q.pricePerOz, 400000); assert.match(q.observedAt, /^20\d\d-/);
  assert.throws(() => parseGoldApi({ error: "x" }));
  const ticks = buildTicks({ gold: q, silver: { pricePerOz: 5000, observedAt: q.observedAt } }, { gold: { import_duty_pct: 6, local_premium_pct: 0 }, silver: { import_duty_pct: 6, local_premium_pct: 0 } });
  assert.equal(ticks.length, 4);
  const g24 = ticks.find((t) => t.metal === "gold" && t.purity === 24);
  assert.ok(Math.abs(g24.price - Math.round(perGram(400000, "gold", 24) * 1.06 * 100) / 100) < 0.01);
  assert.ok(validateTicks(ticks.map((t) => ({ metal: t.metal, purity: t.purity, price: t.price }))).ok);
});
