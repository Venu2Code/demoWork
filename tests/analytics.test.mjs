import test from "node:test";
import assert from "node:assert/strict";
import { forecastRange, buyMeter, sellMeter, percentileRank, stdev, logReturns } from "../site/js/lib/analytics.js";

const series = (n, start, step) => Array.from({ length: n }, (_, i) => start + i * step);
const wobble = (n, start) => Array.from({ length: n }, (_, i) => start * (1 + 0.01 * Math.sin(i / 3)));

test("forecast needs enough data and brackets the last price with widening bands", () => {
  assert.equal(forecastRange(series(10, 100, 1)), null);
  const f = forecastRange(wobble(120, 10000));
  assert.equal(f.length, 3);
  for (const r of f) assert.ok(r.low < r.center && r.center < r.high);
  assert.ok(f[2].high - f[2].low > f[0].high - f[0].low, "wider for later days");
});
test("news bias nudges but can never dominate the statistical range", () => {
  const c = wobble(120, 10000), neutral = forecastRange(c, 0), up = forecastRange(c, 1), crazy = forecastRange(c, 999);
  assert.ok(up[0].center > neutral[0].center);
  assert.deepEqual(crazy[2], forecastRange(c, 1)[2], "bias clamped to 1");
  const sigma = neutral[0].sigmaPct / 100;
  assert.ok(up[2].center / neutral[2].center - 1 <= Math.expm1(0.5 * sigma * 3) + 1e-9);
  assert.deepEqual(forecastRange(c, NaN)[0], neutral[0]);
});
test("buy meter: cheap-in-a-year scores higher than at a 12-month high", () => {
  const down = [...series(300, 12000, 5), ...series(100, 13500, -20)];   // fell from peak to a low area
  const up = [...series(300, 10000, 5), ...series(100, 11500, 40)];      // keeps making new highs
  const cheap = buyMeter(down), dear = buyMeter(up);
  assert.ok(cheap.score > dear.score, `${cheap.score} vs ${dear.score}`);
  assert.equal(cheap.parts.length, 3);
  for (const m of [cheap, dear]) assert.ok(m.score >= 0 && m.score <= 100);
  assert.equal(buyMeter(series(20, 1, 1)), null);
});
test("sell meter follows the +50% rule", () => {
  assert.equal(sellMeter(-10).zone, "below");
  assert.equal(sellMeter(10).zone, "hold");
  assert.equal(sellMeter(41).zone, "near");
  assert.equal(sellMeter(50).zone, "sell");
  assert.equal(sellMeter(80).progress, 100);
  assert.equal(sellMeter(25).progress, 50);
});
test("helpers", () => {
  assert.equal(percentileRank([1, 2, 3, 4], 2), 0.5);
  assert.ok(stdev([1, 1, 1]) === 0);
  assert.equal(logReturns([100, 110]).length, 1);
});
