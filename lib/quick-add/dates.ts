const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
type Weekday = (typeof WEEKDAYS)[number];

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function resolveDueKeyword(keyword: string, now: Date): Date | null {
  const today = startOfUtcDay(now);
  const lower = keyword.toLowerCase();

  if (lower === "today") return today;
  if (lower === "tomorrow") {
    return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1));
  }

  if ((WEEKDAYS as readonly string[]).includes(lower)) {
    const target = WEEKDAYS.indexOf(lower as Weekday);
    const current = today.getUTCDay();
    const diff = (target - current + 7) % 7; // 0..6, 0 = today
    return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + diff));
  }

  // ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(lower)) {
    const [y, m, d] = lower.split("-").map(Number);
    const candidate = new Date(Date.UTC(y, m - 1, d));
    // Reject "month-overflow" round-trips like 2026-02-30 → 2026-03-02.
    if (
      candidate.getUTCFullYear() !== y ||
      candidate.getUTCMonth() !== m - 1 ||
      candidate.getUTCDate() !== d
    ) {
      return null;
    }
    return candidate;
  }

  return null;
}
