import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addDays,
  ageOn,
  birthdayObservedOn,
  daysBetween,
  isLeapYear,
  parseIso,
  todayIn,
} from "../src/lib/dates";

test("todayIn resolves the civil date in the given zone", () => {
  // 18:30 UTC on 12 Sept is already the 13th in Kolkata (UTC+5:30).
  const instant = new Date("2026-09-12T18:45:00Z");
  assert.equal(todayIn("Asia/Kolkata", instant).iso, "2026-09-13");
  assert.equal(todayIn("UTC", instant).iso, "2026-09-12");
  assert.equal(todayIn("America/Los_Angeles", instant).iso, "2026-09-12");
});

test("todayIn handles the day boundary exactly", () => {
  const justBefore = new Date("2026-09-12T18:29:59Z");
  const justAfter = new Date("2026-09-12T18:30:01Z");
  assert.equal(todayIn("Asia/Kolkata", justBefore).iso, "2026-09-12");
  assert.equal(todayIn("Asia/Kolkata", justAfter).iso, "2026-09-13");
});

test("addDays rolls months and years", () => {
  assert.equal(addDays(parseIso("2026-01-31"), 1).iso, "2026-02-01");
  assert.equal(addDays(parseIso("2026-12-31"), 1).iso, "2027-01-01");
  assert.equal(addDays(parseIso("2026-03-01"), -1).iso, "2026-02-28");
  assert.equal(addDays(parseIso("2024-03-01"), -1).iso, "2024-02-29");
});

test("isLeapYear follows the century rule", () => {
  assert.equal(isLeapYear(2024), true);
  assert.equal(isLeapYear(2026), false);
  assert.equal(isLeapYear(1900), false);
  assert.equal(isLeapYear(2000), true);
});

test("29 February birthdays are observed on the 28th in common years", () => {
  assert.deepEqual(birthdayObservedOn(2, 29, 2024), { month: 2, day: 29 });
  assert.deepEqual(birthdayObservedOn(2, 29, 2026), { month: 2, day: 28 });
  assert.deepEqual(birthdayObservedOn(7, 4, 2026), { month: 7, day: 4 });
});

test("daysBetween counts calendar days, signed", () => {
  assert.equal(daysBetween(parseIso("2026-09-13"), parseIso("2026-09-20")), 7);
  assert.equal(daysBetween(parseIso("2026-09-13"), parseIso("2026-09-13")), 0);
  assert.equal(daysBetween(parseIso("2026-09-20"), parseIso("2026-09-13")), -7);
  // Spanning a DST change in zones that observe it must still be whole days.
  assert.equal(daysBetween(parseIso("2026-03-01"), parseIso("2026-04-01")), 31);
});

test("ageOn does not count a birthday that has not happened yet", () => {
  const dob = parseIso("1995-09-20");
  assert.equal(ageOn(dob, parseIso("2026-09-19")), 30);
  assert.equal(ageOn(dob, parseIso("2026-09-20")), 31);
  assert.equal(ageOn(dob, parseIso("2026-09-21")), 31);
});

test("parseIso rejects malformed input", () => {
  assert.throws(() => parseIso("13-09-2026"));
  assert.throws(() => parseIso("2026-9-13"));
});
