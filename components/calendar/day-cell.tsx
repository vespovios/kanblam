"use client";

import { useDroppable } from "@dnd-kit/core";
import { CalendarDayPill } from "./calendar-day-pill";
import { DayOverflowPopover } from "./day-overflow-popover";
import type { CalendarTask, CalendarHoliday } from "./calendar-board";

const MAX_VISIBLE_TASKS = 4;

function compareTasks(a: CalendarTask, b: CalendarTask): number {
  const byPriority = a.priority.order - b.priority.order;
  if (byPriority !== 0) return byPriority;
  return a.name.localeCompare(b.name);
}

/** Bar lane row height — must match calendar-bar-segment.tsx + month-grid.tsx. */
const BAR_LANE_HEIGHT = 22;
/** Fixed height of the date row at the top of every cell — matches the
 *  parent month-grid's first `gridTemplateRows` entry so the cell's
 *  internal layout aligns with where bar segments render. Sized to leave
 *  a comfortable gap below the date number before the first bar lane. */
const DATE_ROW_HEIGHT = 32;

interface Props {
  date: Date;
  isToday: boolean;
  isOtherMonth: boolean;
  isWorking: boolean;
  holiday: CalendarHoliday | null;
  tasksForDay: CalendarTask[];
  onTaskClick?: (task: CalendarTask) => void;
  onEmptyClick?: (date: Date) => void;
  /** When set, places the cell in a parent week-grid (col 1..7, spanning all rows). */
  gridColumn?: number;
  /** Number of multi-day bar lanes in the parent week — reserves matching
   *  vertical space between the date row and the cell's pill content so
   *  bars render in their own visual stripe. */
  barLaneCount?: number;
}

export function DayCell({
  date,
  isToday,
  isOtherMonth,
  isWorking,
  holiday,
  tasksForDay,
  onTaskClick,
  onEmptyClick,
  gridColumn,
  barLaneCount = 0,
}: Props) {
  const dateKey = date.toISOString().slice(0, 10);
  const { setNodeRef, isOver } = useDroppable({ id: `day-${dateKey}`, data: { dateKey } });

  const dayNum = date.getUTCDate();
  const baseBg = isWorking ? "bg-card" : "bg-muted/40";
  const dimText = isOtherMonth ? "text-muted-foreground/50" : "text-foreground";
  const todayClass = isToday ? "font-bold text-primary" : "";

  const sorted = [...tasksForDay].sort(compareTasks);
  const visible = sorted.slice(0, MAX_VISIBLE_TASKS);
  const overflow = Math.max(0, sorted.length - MAX_VISIBLE_TASKS);

  const positioned = gridColumn !== undefined;
  // Cell layout (top → bottom): fixed date row → bar-lane spacer (matches
  // the parent grid's bar rows so bars paint inside it) → cell content
  // (holiday, pills, overflow). Cell still spans gridRow 1 / -1 so its
  // border encloses everything.
  //
  // We deliberately do NOT set z-index here — that would create a
  // stacking context that traps dragged pills inside the cell, making
  // them invisible when they cross into adjacent cells. Bar segments
  // render with their own z-index 1, which lifts them above cells
  // without needing one here.
  const cellStyle: React.CSSProperties | undefined = positioned
    ? {
        gridColumnStart: gridColumn,
        gridColumnEnd: gridColumn + 1,
        gridRowStart: 1,
        gridRowEnd: -1,
        minHeight: `${110 + barLaneCount * BAR_LANE_HEIGHT}px`,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      onClick={() => onEmptyClick?.(date)}
      style={cellStyle}
      className={`relative flex flex-col border border-border/40 cursor-pointer min-w-0 ${
        positioned ? "" : "min-h-[110px]"
      } ${baseBg} ${isOver ? "ring-2 ring-primary/40" : ""}`}
    >
      {/* Date row — fixed height so it lines up with the parent grid's
          first template row across every cell in the week. */}
      <div
        className="px-1.5 pt-1 shrink-0"
        style={{ height: `${DATE_ROW_HEIGHT}px` }}
      >
        <span className={`text-xs ${dimText} ${todayClass}`}>{dayNum}</span>
      </div>

      {/* Bar-lane spacer — invisible. The parent grid renders
          <CalendarBarSegment> elements at the same gridRow positions,
          and they paint visually inside this stripe. */}
      {barLaneCount > 0 && (
        <div
          aria-hidden="true"
          className="shrink-0"
          style={{ height: `${barLaneCount * BAR_LANE_HEIGHT}px` }}
        />
      )}

      {/* Cell content — holiday + single-day pills + overflow popover. */}
      <div className="flex-1 flex flex-col gap-1 px-1.5 pb-1.5 pt-0.5 min-h-0">
        {holiday && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-400 truncate shrink-0"
          >
            {holiday.name}
          </div>
        )}
        <div className="flex flex-col gap-0.5">
          {visible.map((task) => (
            <CalendarDayPill key={task.id} task={task} onClick={() => onTaskClick?.(task)} />
          ))}
          {overflow > 0 && onTaskClick && (
            <DayOverflowPopover
              date={date}
              overflowCount={overflow}
              allTasks={sorted}
              onTaskClick={onTaskClick}
            />
          )}
        </div>
      </div>
    </div>
  );
}
