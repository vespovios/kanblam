/** ISO weekday: 1=Monday … 7=Sunday. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * Uses UTC getters so dates stored by Prisma as `@db.Date` (serialized as UTC
 * midnight, e.g. `2026-12-25T00:00:00.000Z`) compare correctly against
 * user-constructed dates regardless of the host TZ. Callers constructing
 * "today" should do so in UTC too — see `app/(app)/dashboard/page.tsx`.
 */
function isoWeekday(d: Date): IsoWeekday {
  // Date.getUTCDay() returns 0=Sun … 6=Sat. Convert to ISO where 1=Mon … 7=Sun.
  const jsDay = d.getUTCDay();
  return (jsDay === 0 ? 7 : jsDay) as IsoWeekday;
}

function sameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/** True when `date` falls on a configured working weekday AND is not a holiday. */
export function isWorkingDay(
  date: Date,
  workingDays: readonly number[],
  holidays: readonly Date[],
): boolean {
  const wd = isoWeekday(date);
  if (!workingDays.includes(wd)) return false;
  for (const h of holidays) {
    if (sameCalendarDay(h, date)) return false;
  }
  return true;
}
