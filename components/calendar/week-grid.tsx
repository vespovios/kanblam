"use client";

import { useEffect, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { gridDays } from "@/lib/calendar/window";
import { isWorkingDay } from "@/lib/dates/working-days";
import { barsForWeek, classifyTask, type BarTask } from "@/lib/calendar/bars";
import { CalendarDayPill } from "./calendar-day-pill";
import { CalendarBarSegment } from "./calendar-bar-segment";
import type { CalendarTask, CalendarHoliday } from "./calendar-board";

const BAR_LANE_HEIGHT = 22; // px — must match day-cell.tsx

interface Props {
  referenceDate: Date;
  tasks: CalendarTask[];
  holidays: CalendarHoliday[];
  workingDays: number[];
  onTaskClick?: (task: CalendarTask) => void;
  onEmptyClick?: (date: Date) => void;
}

const WEEKDAY_LONG = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function compareTasks(a: CalendarTask, b: CalendarTask): number {
  const byPriority = a.priority.order - b.priority.order;
  if (byPriority !== 0) return byPriority;
  return a.name.localeCompare(b.name);
}

function WeekDayColumn({
  day,
  isToday,
  isWorking,
  holiday,
  tasks,
  onTaskClick,
  onEmptyClick,
  gridColumn,
  barLaneCount,
}: {
  day: Date;
  isToday: boolean;
  isWorking: boolean;
  holiday: CalendarHoliday | null;
  tasks: CalendarTask[];
  onTaskClick?: (task: CalendarTask) => void;
  onEmptyClick?: (date: Date) => void;
  gridColumn: number;
  barLaneCount: number;
}) {
  const dateKey = day.toISOString().slice(0, 10);
  const { setNodeRef, isOver } = useDroppable({ id: `day-${dateKey}`, data: { dateKey } });
  const baseBg = isWorking ? "bg-card" : "bg-muted/40";

  return (
    <div
      ref={setNodeRef}
      onClick={() => onEmptyClick?.(day)}
      style={{
        gridColumnStart: gridColumn,
        gridColumnEnd: gridColumn + 1,
        gridRowStart: 1,
        gridRowEnd: -1,
        paddingTop: `${barLaneCount * BAR_LANE_HEIGHT + 8}px`,
        minHeight: `${500 + barLaneCount * BAR_LANE_HEIGHT}px`,
      }}
      className={`relative flex flex-col gap-1 p-2 border-l border-border/40 first:border-l-0 cursor-pointer min-w-0 ${baseBg} ${
        isToday ? "ring-1 ring-primary/30" : ""
      } ${isOver ? "ring-2 ring-primary/40" : ""}`}
    >
      {holiday && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-400 truncate"
        >
          {holiday.name}
        </div>
      )}
      <div className="flex flex-col gap-1">
        {tasks.map((task) => (
          <CalendarDayPill key={task.id} task={task} onClick={() => onTaskClick?.(task)} />
        ))}
      </div>
    </div>
  );
}

export function WeekGrid({
  referenceDate,
  tasks,
  holidays,
  workingDays,
  onTaskClick,
  onEmptyClick,
}: Props) {
  const days = gridDays("week", referenceDate);
  // See month-grid.tsx — same SSR-safe "today" computation pattern.
  const [todayUtc, setTodayUtc] = useState<Date | null>(null);
  useEffect(() => {
    const t = new Date();
    setTodayUtc(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())));
  }, []);

  const holidayByDate = new Map<string, CalendarHoliday>();
  for (const h of holidays) holidayByDate.set(h.date, h);

  // Bars (multi-bar + open-bar) feed barsForWeek; keep a parallel handle to
  // the wider CalendarTask for rehydrating segments at render time.
  const barTasks: (BarTask & { task: CalendarTask })[] = tasks
    .filter((t) => {
      const c = classifyTask(t);
      return c === "multi-bar" || c === "open-bar";
    })
    .map((t) => ({ id: t.id, startDate: t.startDate, dueDate: t.dueDate, task: t }));

  const barResult = barsForWeek(days[0], barTasks);
  const weekKey = days[0].toISOString().slice(0, 10);
  const segmentsWithTask = barResult.segments.map((seg) => {
    const ref = barTasks.find((b) => b.id === seg.task.id)!;
    return { ...seg, task: ref.task, weekKey };
  });

  // Pills (per-column stacks): only single-pill class.
  const pillsByDate = new Map<string, CalendarTask[]>();
  for (const t of tasks) {
    if (!t.dueDate) continue;
    if (classifyTask(t) !== "single-pill") continue;
    const key = t.dueDate.slice(0, 10);
    const list = pillsByDate.get(key) ?? [];
    list.push(t);
    pillsByDate.set(key, list);
  }

  const holidayDates = holidays.map((h) => new Date(h.date + "T00:00:00.000Z"));

  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="grid grid-cols-7 bg-muted text-xs font-medium">
        {days.map((day, i) => (
          <div key={day.toISOString()} className="px-2 py-1.5 text-muted-foreground">
            {WEEKDAY_LONG[i]} {day.getUTCDate()}
          </div>
        ))}
      </div>
      <div
        style={{
          display: "grid",
          // `minmax(0, 1fr)` — same reason as month-grid: prevents a wide
          // pill from forcing its column past its 1fr share.
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
          gridTemplateRows:
            barResult.laneCount > 0
              ? `repeat(${barResult.laneCount}, ${BAR_LANE_HEIGHT}px) 1fr`
              : "1fr",
        }}
      >
        {days.map((day, i) => {
          const key = day.toISOString().slice(0, 10);
          const isToday = todayUtc !== null && day.getTime() === todayUtc.getTime();
          const isWorking = isWorkingDay(day, workingDays, holidayDates);
          const holiday = holidayByDate.get(key) ?? null;
          const dayTasks = (pillsByDate.get(key) ?? []).sort(compareTasks);
          return (
            <WeekDayColumn
              key={key}
              day={day}
              isToday={isToday}
              isWorking={isWorking}
              holiday={holiday}
              tasks={dayTasks}
              onTaskClick={onTaskClick}
              onEmptyClick={onEmptyClick}
              gridColumn={i + 1}
              barLaneCount={barResult.laneCount}
            />
          );
        })}
        {/* Bars rendered AFTER cells so they paint on top via DOM order. */}
        {segmentsWithTask.map((seg, idx) => (
          <CalendarBarSegment
            key={`bar-${seg.task.id}-${idx}`}
            segment={seg}
            onClick={onTaskClick}
          />
        ))}
      </div>
    </div>
  );
}
