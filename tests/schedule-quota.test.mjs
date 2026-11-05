import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { staleness, lastScheduledRun, nextScheduledRun } from "../site/js/lib/pricing.js";
import { canSpend, parseUsage, usageNote, monthKey, monthlyLimit, requestsPerRun } from "../scripts/lib/quota.mjs";

const schedule = JSON.parse(readFileSync(new URL("../site/data/schedule.json", import.meta.url), "utf8"));
const workflow = readFileSync(new URL("../.github/workflows/live-prices.yml", import.meta.url), "utf8");
const ist = (s) => new Date(`${s}+05:30`);      // e.g. ist("2026-11-03T18:30:00")  (2026-11-03 is a Tuesday)
const iso = (ms) => new Date(ms).toISOString();

test("workflow cron lines and site schedule describe exactly the same refresh times and days (no drift)", () => {
  const crons = [...workflow.matchAll(/cron:\s*"(\d+) ([\d,]+) \* \* ([\d,\-]+)"/g)];
  assert.ok(crons.length >= 1, "no cron lines found");
  const asIst = [], dayLists = new Set();
  for (const [, min, hours, dow] of crons) {
    for (const h of hours.split(",").map(Number)) {
      const total = h * 60 + Number(min) + 330;
      assert.ok(total < 24 * 60, `${h}:${min} UTC rolls over to the next IST day, which would change the weekday`);
      asIst.push(`${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`);
    }
    dayLists.add(dow === "1-6" ? "1,2,3,4,5,6" : dow);
  }
  assert.deepEqual(asIst.sort(), [...schedule.times].sort(), "cron (converted to IST) must equal schedule.json times");
  assert.deepEqual([...dayLists], [schedule.days.join(",")], "cron weekdays must equal schedule.json days");
});

test("monthly request budget fits the 300/month plan with headroom", () => {
  const perMonth = schedule.times.length * requestsPerRun(schedule.metals) * 26;
  assert.ok(perMonth <= 250, `${perMonth} requests/month would exceed the 250 safety budget`);
  assert.deepEqual(schedule.metals, ["gold"], "the site is currently gold-only");
  assert.equal(requestsPerRun(["gold"]), 1); assert.equal(requestsPerRun(["gold", "silver"]), 2);
});

test("last/next scheduled run are computed in India time, skipping Sundays", () => {
  assert.equal(iso(lastScheduledRun(ist("2026-11-03T18:45:00"), schedule)), iso(ist("2026-11-03T18:30:00").getTime()));
  assert.equal(iso(lastScheduledRun(ist("2026-11-03T09:00:00"), schedule)), iso(ist("2026-11-02T20:00:00").getTime()), "before the first run: yesterday's last");
  assert.equal(iso(nextScheduledRun(ist("2026-11-07T20:30:00"), schedule)), iso(ist("2026-11-09T09:30:00").getTime()), "Saturday night -> Monday 09:30");
  assert.equal(iso(lastScheduledRun(ist("2026-11-08T12:00:00"), schedule)), iso(ist("2026-11-07T20:00:00").getTime()), "Sunday -> Saturday's last run");
  assert.equal(iso(nextScheduledRun(ist("2026-11-03T12:45:00"), schedule)), iso(ist("2026-11-03T14:00:00").getTime()));
});

test("staleness: warns only when a slot older than the 6 h grace was never covered by a check", () => {
  const s = (last, now) => staleness(ist(last).toISOString(), ist(now), schedule).stale;
  assert.equal(schedule.graceMinutes, 360, "tuned to GitHub's scheduler delays");
  assert.equal(s("2026-11-03T14:02:00", "2026-11-03T15:00:00"), false, "fresh check, between runs");
  assert.equal(s("2026-11-03T12:31:00", "2026-11-03T19:15:00"), false, "last check 6.7 h ago, but only the 12:30 slot is old enough and it was covered");
  assert.equal(s("2026-11-03T12:31:00", "2026-11-03T21:00:00"), true, "the 14:00 slot is now 7 h old and was never covered");
  assert.equal(s("2026-11-03T09:35:00", "2026-11-03T19:45:00"), true, "most of the day's slots missed");
  assert.equal(s("2026-11-03T20:02:00", "2026-11-04T07:00:00"), false, "overnight is not stale");
  assert.equal(s("2026-11-04T09:05:00", "2026-11-04T12:00:00"), false, "morning runs still pending, nothing is old enough yet");
  assert.equal(s("2026-11-03T20:02:00", "2026-11-04T15:40:00"), true, "no morning run at all by 15:40: the 09:30 slot is 6 h old and uncovered");
  assert.equal(s("2026-11-07T20:02:00", "2026-11-08T14:00:00"), false, "Sunday is not stale");
  assert.equal(staleness(null, ist("2026-11-03T12:00:00"), schedule).stale, true, "never checked");
  assert.equal(staleness(ist("2026-11-03T08:00:00").toISOString(), ist("2026-11-03T12:00:00")).stale, true, "no schedule: older than 3 h");
});

test("quota guard: counts per month, resets in a new month, never exceeds the limit", () => {
  assert.equal(parseUsage(usageNote("2026-11", 40), "2026-11"), 40);
  assert.equal(parseUsage(usageNote("2026-10", 240), "2026-11"), 0, "new month starts at zero");
  assert.equal(parseUsage("garbage", "2026-11"), 0);
  assert.equal(parseUsage(null, "2026-11"), 0);
  assert.equal(canSpend(249, 1, 250), true);
  assert.equal(canSpend(250, 1, 250), false);
  assert.equal(canSpend(249, 2, 250), false);
  assert.equal(monthKey(new Date("2026-11-30T23:59:00Z")), "2026-11");
  assert.equal(monthlyLimit({}), 250); assert.equal(monthlyLimit({ GOLDAPI_MONTHLY_LIMIT: "" }), 250); assert.equal(monthlyLimit({ GOLDAPI_MONTHLY_LIMIT: "120" }), 120); assert.equal(monthlyLimit({ GOLDAPI_MONTHLY_LIMIT: "abc" }), 250);
});
