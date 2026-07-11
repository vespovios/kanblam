"use client";

import { useEffect, useState } from "react";
import { gridDays } from "@/lib/calendar/window";
import { isWorkingDay } from "@/lib/dates/working-days";
import { barsForWeek, classifyTask, type BarTask } from "@/lib/calendar/bars";
import { DayCell } from "./day-cell";
import { CalendarBarSegment } from "./calendar-bar-segment";
import type { CalendarTask, CalendarHoliday } from "./calendar-board";

const BAR_LANE_HEIGHT = 22; // px — must match day-cell.tsx
const DATE_ROW_HEIGHT = 32; // px — must match day-cell.tsx DATE_ROW_HEIGHT

interface Props {
  referenceDate: Date; // UTC midnight, anywhere in the target month
  tasks: CalendarTask[];
  holidays: CalendarHoliday[];
  workingDays: number[]; // ISO 1..7
  onTaskClick?: (task: CalendarTask) => void;
  onEmptyClick?: (date: Date) => void;
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function MonthGrid({
  referenceDate,
  tasks,
  holidays,
  workingDays,
  onTaskClick,
  onEmptyClick,
}: Props) {
  const days = gridDays("month", referenceDate);
  // Computed client-side after mount to avoid SSR/CSR drift — the server
  // doesn't know the visitor's local date, so highlighting "today" in
  // render-time would cause a hydration mismatch when their timezone puts
  // them on a different calendar day from the server. Null on first paint
  // (no cell highlighted), correct on second paint.
  const [todayUtc, setTodayUtc] = useState<Date | null>(null);
  useEffect(() => {
    const t = new Date();
    setTodayUtc(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())));
  }, []);
  const targetMonth = referenceDate.getUTCMonth();

  // Build lookups (holidays already serialized to YYYY-MM-DD strings by page.tsx).
  const holidayByDate = new Map<string, CalendarHoliday>();
  for (const h of holidays) holidayByDate.set(h.date, h);

  // Group days into weeks (7 each).
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  // Bars (multi-bar + open-bar) feed barsForWeek per week. Keep a parallel
  // handle to the wider CalendarTask so we can rehydrate the segment's task
  // at render — barsForWeek only knows about the narrow BarTask shape.
  const barTasks: (BarTask & { task: CalendarTask })[] = tasks
    .filter((t) => {
      const c = classifyTask(t);
      return c === "multi-bar" || c === "open-bar";
    })
    .map((t) => ({ id: t.id, startDate: t.startDate, dueDate: t.dueDate, task: t }));

  // Pills (per-cell stacks): only single-pill class.
  const pillsByDate = new Map<string, CalendarTask[]>();
  for (const t of tasks) {
    if (!t.dueDate) continue;
    if (classifyTask(t) !== "single-pill") continue;
    const key = t.dueDate.slice(0, 10);
    const list = pillsByDate.get(key) ?? [];
    list.push(t);
    pillsByDate.set(key, list);
  }

  // isWorkingDay wants Date[] for holidays — convert from the serialized strings.
  const holidayDates = holidays.map((h) => new Date(h.date + "T00:00:00.000Z"));

  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="grid grid-cols-7 bg-muted text-xs font-medium">
        {WEEKDAY_LABELS.map((l) => (
          <div key={l} className="px-2 py-1.5 text-muted-foreground">
            {l}
          </div>
        ))}
      </div>
      {weeks.map((week) => {
        const weekStart = week[0];
        const barResult = barsForWeek(weekStart, barTasks);
        // barResult.segments[].task is typed BarTask (narrow). Rehydrate the
        // wider CalendarTask via the parallel barTasks handle. The lookup is
        // safe: every segment's task.id came from barTasks, so find() always
        // returns a hit.
        const weekKey = weekStart.toISOString().slice(0, 10);
        const laneCount = barResult.laneCount;
        const segmentsWithTask = barResult.segments.map((seg) => {
          const ref = barTasks.find((b) => b.id === seg.task.id)!;
          return { ...seg, task: ref.task, weekKey };
        });
        return (
          <div
            key={`wk-${weekKey}`}
            style={{
              display: "grid",
              // `minmax(0, 1fr)` (not bare `1fr`) so a wide pill/bar in any
              // cell can't force its column wider than its share of the row
              // and push the rest of the week sideways. Bare `1fr` allows
              // tracks to grow past their share to fit min-content, which
              // is what surfaced as "long task title stretches Monday" in
              // the May-18 cell during beta dogfooding.
              gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
              // Vertical layout per week: date row → bar lanes → cell content.
              // The date row's height matches DayCell's date row so cell
              // contents line up. Bars render in rows 2..laneCount+1 via
              // <CalendarBarSegment rowOffset={1} />.
              gridTemplateRows:
                laneCount > 0
                  ? `${DATE_ROW_HEIGHT}px repeat(${laneCount}, ${BAR_LANE_HEIGHT}px) 1fr`
                  : `${DATE_ROW_HEIGHT}px 1fr`,
            }}
          >
            {week.map((day, i) => {
              const key = day.toISOString().slice(0, 10);
              const isToday = todayUtc !== null && day.getTime() === todayUtc.getTime();
              const isOtherMonth = day.getUTCMonth() !== targetMonth;
              const isWorking = isWorkingDay(day, workingDays, holidayDates);
              return (
                <DayCell
                  key={key}
                  date={day}
                  isToday={isToday}
                  isOtherMonth={isOtherMonth}
                  isWorking={isWorking}
                  holiday={holidayByDate.get(key) ?? null}
                  tasksForDay={pillsByDate.get(key) ?? []}
                  onTaskClick={onTaskClick}
                  onEmptyClick={onEmptyClick}
                  gridColumn={i + 1}
                  barLaneCount={laneCount}
                />
              );
            })}
            {/* Bars rendered AFTER cells so they paint on top via DOM order.
                rowOffset={1} shifts bars past the date row (the first grid
                row in month view). */}
            {segmentsWithTask.map((seg, idx) => (
              <CalendarBarSegment
                key={`bar-${seg.task.id}-${idx}`}
                segment={seg}
                onClick={onTaskClick}
                rowOffset={1}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
