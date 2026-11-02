import test from "node:test";
import assert from "node:assert/strict";
import { blank, merge, streak, levelFor, totalXp } from "../site/js/store.js";

const day = (n) => { const d = new Date("2026-11-02T12:00:00Z"); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
const now = new Date("2026-11-02T12:00:00Z");

test("streak counts consecutive active days and survives an unfinished today", () => {
  const s = blank();
  s.activity[day(1)] = { lessons: 1 }; s.activity[day(2)] = { news: 1 };
  assert.equal(streak(s, now), 2);
  s.activity[day(0)] = { lessons: 1 };
  assert.equal(streak(s, now), 3);
  s.activity[day(1)] = {};
  assert.equal(streak(s, now), 1);
});
test("level curve grows", () => {
  assert.equal(levelFor(0).level, 1);
  assert.equal(levelFor(100).level, 2);
  assert.ok(levelFor(1000).level > 3);
});
test("merge never loses progress and keeps earliest completion", () => {
  const a = blank(), b = blank();
  a.completed.x = { at: "2026-01-02", xp: 10 }; b.completed.x = { at: "2026-01-01", xp: 10 }; b.completed.y = { at: "2026-01-03", xp: 20 };
  a.activity["2026-01-02"] = { xp: 5, lessons: 1, news: 0 }; b.activity["2026-01-02"] = { xp: 9, lessons: 0, news: 2 };
  a.bookmarks = ["n1"]; b.bookmarks = ["n2"];
  const m = merge(a, b);
  assert.deepEqual(Object.keys(m.completed).sort(), ["x", "y"]);
  assert.equal(m.completed.x.at, "2026-01-01");
  assert.deepEqual(m.activity["2026-01-02"], { xp: 9, lessons: 1, news: 2 });
  assert.deepEqual(m.bookmarks.sort(), ["n1", "n2"]);
  assert.equal(totalXp(m), 30);
});
