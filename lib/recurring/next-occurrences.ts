export type Frequency = "DAILY" | "WEEKLY" | "MONTHLY";

export interface RecurrenceRule {
  frequency: Frequency;
  /** Every N units (days / weeks / months). Must be >= 1. */
  interval: number;
  /** ISO weekdays 1=Mon..7=Sun. Used only for WEEKLY. Empty → use startDate's weekday. */
  daysOfWeek: readonly number[];
  /** First eligible date (UTC midnight). */
  startDate: Date;
  /** Last eligible date (UTC midnight, inclusive), or null for indefinite. */
  endDate: Date | null;
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 24 * 60 * 60 * 1000);
}

function addMonthsClamped(d: Date, n: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + n;
  const day = d.getUTCDate();
  // Last day of target month in UTC
  const lastDayOfMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, lastDayOfMonth);
  return new Date(Date.UTC(y, m, clampedDay));
}

function isoWeekday(d: Date): number {
  const wd = d.getUTCDay();
  return wd === 0 ? 7 : wd;
}

/**
 * Enumerate all occurrence dates of `rule` that fall within `[fromDate, toDate]`.
 *
 * - DAILY: from startDate, every `interval` days.
 * - WEEKLY: every `interval` weeks; within each block, emit on each weekday in
 *   `daysOfWeek` (in ISO 1..7). If `daysOfWeek` is empty, use startDate's weekday.
 * - MONTHLY: from startDate, every `interval` months on the same day-of-month
 *   (clamped to the last day if the target month is shorter).
 *
 * All comparisons are UTC date-level (no time component).
 */
export function nextOccurrences(
  rule: RecurrenceRule,
  fromDate: Date,
  toDate: Date,
): Date[] {
  const start = startOfUtcDay(rule.startDate);
  const from = startOfUtcDay(fromDate);
  const to = startOfUtcDay(toDate);
  const end = rule.endDate ? startOfUtcDay(rule.endDate) : null;

  if (to < start) return [];
  if (end && from > end) return [];

  const upper = end && end < to ? end : to;
  const out: Date[] = [];

  if (rule.frequency === "DAILY") {
    const stepDays = Math.max(1, rule.interval);
    let cursor = start;
    while (cursor <= upper) {
      if (cursor >= from) out.push(cursor);
      cursor = addDays(cursor, stepDays);
    }
    return out;
  }

  if (rule.frequency === "WEEKLY") {
    const stepWeeks = Math.max(1, rule.interval);
    const weekdays =
      rule.daysOfWeek.length > 0 ? [...rule.daysOfWeek].sort((a, b) => a - b) : [isoWeekday(start)];
    // Walk in stepWeeks-week blocks, anchored on the Monday of the start's ISO week.
    const startWeekday = isoWeekday(start);
    const blockAnchor = addDays(start, -(startWeekday - 1)); // back to Monday
    let blockCursor = blockAnchor;
    // Don't emit before startDate even if the block starts earlier.
    while (blockCursor <= upper) {
      for (const wd of weekdays) {
        const occ = addDays(blockCursor, wd - 1); // Mon=offset 0, Tue=1, ...
        if (occ >= start && occ >= from && occ <= upper) {
          out.push(occ);
        }
      }
      blockCursor = addDays(blockCursor, 7 * stepWeeks);
    }
    return out;
  }

  // MONTHLY — step counter anchored on `start` so day-of-month clamping stays stable.
  const stepMonths = Math.max(1, rule.interval);
  for (let i = 0; ; i++) {
    const occ = addMonthsClamped(start, i * stepMonths);
    if (occ > upper) break;
    if (occ >= from) out.push(occ);
  }
  return out;
}

/**
 * The end of the generation window — far enough out to always surface at
 * least `minOccurrences` upcoming instances, but never less than `minDays`
 * out.
 *
 * Why: a fixed N-day window works for daily/weekly rules (you always see the
 * next few) but barely materialises anything for monthly/quarterly/yearly
 * rules — the next occurrence is often well past the window, so the series
 * *looks* broken. Bounding by occurrence count instead keeps short-interval
 * rules to a sane number of rows while letting long-interval rules show
 * their next handful.
 *
 * The bound is anchored on `today` (not on a rolling high-water mark) so it
 * doesn't run away — each cron pass tops the window up by whatever has
 * crept into range, no more.
 */
export function generationWindowEnd(
  rule: RecurrenceRule,
  today: Date,
  minDays: number,
  minOccurrences: number,
): Date {
  const base = startOfUtcDay(today);
  const dayBound = addDays(base, minDays);
  // Look far enough ahead to find `minOccurrences` occurrences — generous
  // upper bound so even a yearly rule is covered. The rule's own endDate
  // caps `nextOccurrences` anyway, so an over-wide search is harmless.
  const searchBound = addMonthsClamped(base, (minOccurrences + 1) * 12);
  const upcoming = nextOccurrences(rule, base, searchBound);
  const nth = upcoming[minOccurrences - 1];
  if (!nth) return dayBound; // fewer than minOccurrences left in the series
  return nth > dayBound ? nth : dayBound;
}
