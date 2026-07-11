export type CalendarView = "month" | "week";

export interface VisibleWindow {
  /** First day of the visible window (UTC midnight, Monday). */
  from: Date;
  /** Last day of the visible window (UTC midnight, Sunday). */
  to: Date;
  /** All days in the window in calendar order, UTC midnight. */
  days: Date[];
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 24 * 60 * 60 * 1000);
}

/** ISO weekday: Mon=1..Sun=7. */
function isoWeekday(d: Date): number {
  const wd = d.getUTCDay();
  return wd === 0 ? 7 : wd;
}

function mondayOnOrBefore(d: Date): Date {
  const day = startOfUtcDay(d);
  return addDays(day, -(isoWeekday(day) - 1));
}

function sundayOnOrAfter(d: Date): Date {
  const day = startOfUtcDay(d);
  return addDays(day, 7 - isoWeekday(day));
}

/**
 * Is the given date inside the current ISO week (Monday-Sunday, UTC)?
 * Used by the calendar bar/pill renderers to pick the "current/active"
 * accent colour vs the muted default. Accepts ISO strings (the shape
 * the component receives from server props) and Date objects.
 */
export function isInCurrentIsoWeek(d: Date | string | null): boolean {
  if (!d) return false;
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return false;
  const day = startOfUtcDay(date);
  const today = startOfUtcDay(new Date());
  const monday = mondayOnOrBefore(today);
  const nextMonday = addDays(monday, 7);
  return day >= monday && day < nextMonday;
}

function enumerateDays(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  let cursor = from;
  while (cursor <= to) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

/**
 * Compute the visible date window for a given view and reference date.
 *
 * - `month`: Monday on/before the 1st of the reference's month → Sunday on/after
 *   the last day of that month. 28, 35, or 42 days.
 * - `week`: Monday on/before the reference → Sunday on/after the reference.
 *   Always 7 days.
 *
 * All dates are UTC midnight. The reference date's time-of-day is ignored.
 */
export function visibleWindow(view: CalendarView, reference: Date): VisibleWindow {
  if (view === "week") {
    const from = mondayOnOrBefore(reference);
    const to = addDays(from, 6);
    return { from, to, days: enumerateDays(from, to) };
  }
  const ref = startOfUtcDay(reference);
  const firstOfMonth = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1));
  const lastOfMonth = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 0));
  const from = mondayOnOrBefore(firstOfMonth);
  const to = sundayOnOrAfter(lastOfMonth);
  return { from, to, days: enumerateDays(from, to) };
}

/** Convenience: same days as visibleWindow(...).days. */
export function gridDays(view: CalendarView, reference: Date): Date[] {
  return visibleWindow(view, reference).days;
}
