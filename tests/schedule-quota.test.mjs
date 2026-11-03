import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { staleness, lastScheduledRun, nextScheduledRun } from "../site/js/lib/pricing.js";
import { canSpend, parseUsage, usageNote, monthKey, monthlyLimit, REQUESTS_PER_RUN } from "../scripts/lib/quota.mjs";

const schedule = JSON.parse(readFileSync(new URL("../site/data/schedule.json", import.meta.url), "utf8"));
const workflow = readFileSync(new URL("../.github/workflows/live-prices.yml", import.meta.url), "utf8");
const ist = (s) => new Date(`${s}+05:30`);      // e.g. ist("2026-11-03T18:30:00")  (2026-11-03 is a Tuesday)

test("workflow cron and site schedule describe the same refresh times (no drift)", () => {
  const m = workflow.match(/cron:\s*"(\d+) ([\d,]+) \* \* ([\d,\-]+)"/);
  assert.ok(m, "cron line not found");
  const minute = Number(m[1]), hoursUtc = m[2].split(",").map(Number);
  const asIst = hoursUtc.map((h) => { const total = h * 60 + minute + 330; return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`; });
  assert.deepEqual(asIst, schedule.times, "cron (converted to IST) must equal schedule.json times");
  assert.ok(hoursUtc.every((h) => (h * 60 + minute + 330) < 24 * 60), "IST times must fall on the same weekday as UTC");
  const days = m[3] === "1-6" ? [1, 2, 3, 4, 5, 6] : m[3].split(",").map(Number);
  assert.deepEqual(days, schedule.days);
});
test("monthly request budget fits the 300/month plan with headroom", () => {
  const perMonth = schedule.times.length * REQUESTS_PER_RUN * 31 * (schedule.days.length / 7) ;
  assert.ok(perMonth <= 250, `~${Math.round(perMonth)} requests/month`);
  assert.ok(schedule.times.length * REQUESTS_PER_RUN * 26 <= 250);
});

test("last/next scheduled run are computed in India time, skipping Sundays", () => {
  assert.equal(new Date(lastScheduledRun(ist("2026-11-03T18:30:00"), schedule)).toISOString(), ist("2026-11-03T16:00:00").toISOString());
  assert.equal(new Date(lastScheduledRun(ist("2026-11-03T09:00:00"), schedule)).toISOString(), ist("2026-11-02T19:00:00").toISOString());   // before first run: yesterday's last
  assert.equal(new Date(nextScheduledRun(ist("2026-11-07T20:00:00"), schedule)).toISOString(), ist("2026-11-09T10:00:00").toISOString());   // Sat night -> Monday 10:00
  assert.equal(new Date(lastScheduledRun(ist("2026-11-08T12:00:00"), schedule)).toISOString(), ist("2026-11-07T19:00:00").toISOString());   // Sunday -> Saturday 19:00
});
test("staleness: only a MISSED scheduled update is stale", () => {
  const s = (last, now) => staleness(ist(last).toISOString(), ist(now), schedule).stale;
  assert.equal(s("2026-11-03T16:02:00", "2026-11-03T18:30:00"), false, "ran on time, between runs");
  assert.equal(s("2026-11-03T10:05:00", "2026-11-03T18:30:00"), true, "13:00 and 16:00 runs missed");
  assert.equal(s("2026-11-03T19:02:00", "2026-11-04T07:00:00"), false, "overnight is not stale");
  assert.equal(s("2026-11-07T19:02:00", "2026-11-08T14:00:00"), false, "Sunday is not stale");
  assert.equal(s("2026-11-03T13:02:00", "2026-11-03T16:30:00"), false, "16:00 run is only 30 min late: still within the 90 min grace");
  assert.equal(s("2026-11-03T13:02:00", "2026-11-03T17:45:00"), true, "90 min grace exceeded");
  assert.equal(staleness(null, ist("2026-11-03T12:00:00"), schedule).stale, true, "never checked");
});

test("quota guard: counts per month, resets in a new month, never exceeds the limit", () => {
  assert.equal(parseUsage(usageNote("2026-11", 40), "2026-11"), 40);
  assert.equal(parseUsage(usageNote("2026-10", 240), "2026-11"), 0, "new month starts at zero");
  assert.equal(parseUsage("garbage", "2026-11"), 0);
  assert.equal(parseUsage(null, "2026-11"), 0);
  assert.equal(canSpend(248, 2, 250), true);
  assert.equal(canSpend(249, 2, 250), false);
  assert.equal(monthKey(new Date("2026-11-30T23:59:00Z")), "2026-11");
  assert.equal(monthlyLimit({}), 250); assert.equal(monthlyLimit({ GOLDAPI_MONTHLY_LIMIT: "" }), 250); assert.equal(monthlyLimit({ GOLDAPI_MONTHLY_LIMIT: "120" }), 120); assert.equal(monthlyLimit({ GOLDAPI_MONTHLY_LIMIT: "abc" }), 250);
});
