"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { CalendarView } from "@/lib/calendar/window";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function addUtcMonths(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate()));
}

function addUtcDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 24 * 60 * 60 * 1000);
}

function formatMonth(d: Date): string {
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function formatWeekRange(weekStart: Date): string {
  const monday = weekStart;
  const sunday = addUtcDays(monday, 6);
  const sameMonth = monday.getUTCMonth() === sunday.getUTCMonth();
  const sameYear = monday.getUTCFullYear() === sunday.getUTCFullYear();
  const month = MONTH_NAMES[monday.getUTCMonth()].slice(0, 3);
  const monthB = MONTH_NAMES[sunday.getUTCMonth()].slice(0, 3);
  if (sameMonth) {
    return `${month} ${monday.getUTCDate()} – ${sunday.getUTCDate()}, ${monday.getUTCFullYear()}`;
  }
  if (sameYear) {
    return `${month} ${monday.getUTCDate()} – ${monthB} ${sunday.getUTCDate()}, ${monday.getUTCFullYear()}`;
  }
  return `${month} ${monday.getUTCDate()}, ${monday.getUTCFullYear()} – ${monthB} ${sunday.getUTCDate()}, ${sunday.getUTCFullYear()}`;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface Props {
  view: CalendarView;
  referenceDate: Date;
  weekStart: Date | null;
}

/**
 * Calendar-specific nav: prev / today / next + date label, view switcher
 * (month/week), and a legend explaining the bar/pill colour scheme.
 *
 * Project, assignee, tags, hide-completed filters all live in the
 * global filter strip in the topbar — they aren't repeated here.
 */
export function CalendarNav({ view, referenceDate, weekStart }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function navigateTo(nextView: CalendarView, date: Date) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", nextView);
    params.set("date", isoDate(date));
    router.replace(`${pathname}?${params.toString()}`);
  }

  function step(direction: -1 | 1) {
    if (view === "month") {
      navigateTo(view, addUtcMonths(referenceDate, direction));
    } else {
      navigateTo(view, addUtcDays(weekStart ?? referenceDate, direction * 7));
    }
  }

  function jumpToToday() {
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    navigateTo(view, today);
  }

  const label = view === "month"
    ? formatMonth(referenceDate)
    : formatWeekRange(weekStart ?? referenceDate);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" onClick={() => step(-1)} aria-label="Previous">
          ‹
        </Button>
        <Button variant="outline" size="sm" onClick={jumpToToday}>
          Today
        </Button>
        <Button variant="outline" size="sm" onClick={() => step(1)} aria-label="Next">
          ›
        </Button>
        <span className="ml-3 text-sm font-medium">{label}</span>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        {/* Legend — explains what the bar/pill colours mean. Same swatches
            as the actual bars so the mapping reads at a glance. */}
        <div className="flex items-center gap-3 text-xs">
          <span
            className="inline-flex items-center gap-1.5 text-muted-foreground"
            title="Tasks due in the current week (Mon–Sun)"
          >
            <span
              aria-hidden="true"
              className="inline-block w-4 h-3 rounded-sm shadow-sm"
              style={{ background: "var(--bar-active)" }}
            />
            This week
          </span>
          <span
            className="inline-flex items-center gap-1.5 text-muted-foreground"
            title="Tasks due in another week or with no due date"
          >
            <span
              aria-hidden="true"
              className="inline-block w-4 h-3 rounded-sm shadow-sm"
              style={{ background: "var(--bar-default)" }}
            />
            Other
          </span>
        </div>

        {/* Month / Week view toggle */}
        <div className="flex items-center gap-1">
          <Button
            variant={view === "month" ? "default" : "outline"}
            size="sm"
            onClick={() => navigateTo("month", referenceDate)}
          >
            Month
          </Button>
          <Button
            variant={view === "week" ? "default" : "outline"}
            size="sm"
            onClick={() => navigateTo("week", referenceDate)}
          >
            Week
          </Button>
        </div>
      </div>
    </div>
  );
}
