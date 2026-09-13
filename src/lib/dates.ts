/**
 * Date helpers that are explicit about timezone.
 *
 * "Whose birthday is it today?" has no answer without a timezone, and a server
 * running in UTC will otherwise wish people a day early or late. Everything
 * here works on `YYYY-MM-DD` civil dates resolved in BUSINESS_TIMEZONE.
 */

export type CivilDate = { year: number; month: number; day: number; iso: string };

/** The calendar date it currently is in `timeZone`. */
export function todayIn(timeZone: string, now: Date = new Date()): CivilDate {
  // en-CA renders as YYYY-MM-DD, which is exactly the shape we want.
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parseIso(iso);
}

export function parseIso(iso: string): CivilDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new Error(`Expected YYYY-MM-DD, got "${iso}"`);
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    iso,
  };
}

export function formatIso(date: CivilDate): string {
  const mm = String(date.month).padStart(2, "0");
  const dd = String(date.day).padStart(2, "0");
  return `${date.year}-${mm}-${dd}`;
}

/** Adds (or subtracts) whole days, rolling months and years correctly. */
export function addDays(date: CivilDate, days: number): CivilDate {
  const utc = Date.UTC(date.year, date.month - 1, date.day);
  const shifted = new Date(utc + days * 86_400_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    iso: shifted.toISOString().slice(0, 10),
  };
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * The (month, day) on which a birthday should be greeted in `year`.
 *
 * 29 February only exists every fourth year; we greet those contacts on
 * 28 February in common years rather than skipping them entirely.
 */
export function birthdayObservedOn(
  birthMonth: number,
  birthDay: number,
  year: number,
): { month: number; day: number } {
  if (birthMonth === 2 && birthDay === 29 && !isLeapYear(year)) {
    return { month: 2, day: 28 };
  }
  return { month: birthMonth, day: birthDay };
}

/** Whole days from `from` to `to`; negative when `to` is in the past. */
export function daysBetween(from: CivilDate, to: CivilDate): number {
  const a = Date.UTC(from.year, from.month - 1, from.day);
  const b = Date.UTC(to.year, to.month - 1, to.day);
  return Math.round((b - a) / 86_400_000);
}

/** Age in whole years on `on`, or null when the birth date is unknown. */
export function ageOn(birth: CivilDate, on: CivilDate): number | null {
  let age = on.year - birth.year;
  if (on.month < birth.month || (on.month === birth.month && on.day < birth.day)) age -= 1;
  return age >= 0 ? age : null;
}
