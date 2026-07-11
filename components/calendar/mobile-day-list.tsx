"use client";

import { gridDays } from "@/lib/calendar/window";
import type { CalendarView } from "@/lib/calendar/window";
import { CalendarDayPill } from "./calendar-day-pill";
import type { CalendarTask, CalendarHoliday } from "./calendar-board";

// TODO (deferred polish): render multi-day tasks once per day they cover
// with a "Day N of M" indicator. Currently a multi-day task appears once
// at its dueDate, and a start-only task appears once at its startDate.

interface Props {
  view: CalendarView;
  referenceDate: Date;
  tasks: CalendarTask[];
  holidays: CalendarHoliday[];
  onTaskClick?: (task: CalendarTask) => void;
}

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function isoWeekday(d: Date): number {
  const wd = d.getUTCDay();
  return wd === 0 ? 7 : wd;
}

function compareTasks(a: CalendarTask, b: CalendarTask): number {
  const byPriority = a.priority.order - b.priority.order;
  if (byPriority !== 0) return byPriority;
  return a.name.localeCompare(b.name);
}

export function MobileDayList({ view, referenceDate, tasks, holidays, onTaskClick }: Props) {
  const days = gridDays(view, referenceDate);

  const holidayByDate = new Map<string, CalendarHoliday>();
  for (const h of holidays) holidayByDate.set(h.date, h);

  // Group by dueDate when present, else startDate (start-only tasks now
  // surface from the OR-overlap query and would otherwise be invisible
  // on mobile). Tasks with neither date are skipped.
  const tasksByDate = new Map<string, CalendarTask[]>();
  for (const t of tasks) {
    const key = t.dueDate
      ? t.dueDate.slice(0, 10)
      : t.startDate
        ? t.startDate.slice(0, 10)
        : null;
    if (!key) continue;
    const list = tasksByDate.get(key) ?? [];
    list.push(t);
    tasksByDate.set(key, list);
  }

  const hasAnything = days.some((d) => {
    const key = d.toISOString().slice(0, 10);
    return (tasksByDate.get(key)?.length ?? 0) > 0 || holidayByDate.has(key);
  });

  if (!hasAnything) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">No tasks scheduled in this period.</p>
        <p className="text-xs text-muted-foreground mt-1">
          Head to <a href="/tasks" className="underline hover:text-foreground">/tasks</a> to add one.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {days.map((day) => {
        const key = day.toISOString().slice(0, 10);
        const dayTasks = (tasksByDate.get(key) ?? []).sort(compareTasks);
        const holiday = holidayByDate.get(key) ?? null;
        if (dayTasks.length === 0 && !holiday) return null; // skip empty days
        const wdIdx = isoWeekday(day) - 1;
        return (
          <div key={key} className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span>
                {WEEKDAY_SHORT[wdIdx]}, {MONTH_SHORT[day.getUTCMonth()]} {day.getUTCDate()}
              </span>
              {holiday && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-400">
                  {holiday.name}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1 pl-2">
              {dayTasks.map((task) => (
                <CalendarDayPill key={task.id} task={task} onClick={() => onTaskClick?.(task)} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
