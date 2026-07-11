/**
 * Date formatting helpers — unambiguous, locale-independent.
 *
 * The app deliberately avoids `toLocaleDateString()` for display: its output
 * defaults to the browser locale (M/D/YYYY on US-English, D/M/YYYY elsewhere),
 * which is ambiguous when both numbers are <= 12 and varies between users on
 * the same shared screen. QA pass 2026-05-17 (Issue #11) flagged dates like
 * `5/16/2026` and `5/18/2026` as confusing.
 *
 * Everything routes through `Intl.DateTimeFormat` with an explicit `en-GB`
 * locale, which yields "16 May 2026" — month-name spelled out, unambiguous
 * day/month order. Server and client render identically.
 */

const SHORT_DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Format a date or ISO string as a short, unambiguous date — e.g. `16 May 2026`.
 *
 * Returns the supplied dash placeholder for null / undefined / unparseable
 * inputs so callsites can render directly without their own guards.
 */
export function formatShortDate(
  value: Date | string | null | undefined,
  placeholder = "—",
): string {
  if (value === null || value === undefined) return placeholder;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return placeholder;
  return SHORT_DATE_FMT.format(d);
}
