"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Repeat } from "lucide-react";
import type { BarSegment } from "@/lib/calendar/bars";
import { isInCurrentIsoWeek } from "@/lib/calendar/window";
import type { CalendarTask } from "./calendar-board";

interface Props {
  segment: BarSegment & { task: CalendarTask; weekKey: string };
  onClick?: (task: CalendarTask) => void;
  /** Grid rows to skip before the bar lane area. Default 0 (week view —
   *  bars at the top of the grid). Month view passes 1 to reserve grid
   *  row 1 for the date row, with bars beneath. */
  rowOffset?: number;
}

function fmt(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function CalendarBarSegment({ segment, onClick, rowOffset = 0 }: Props) {
  const { task, leftEdge, rightEdge, colStart, colSpan, lane } = segment;
  const isRecurring = task.recurringTemplateId !== null;

  // Multi-week bars are split into one segment per week. Each segment must
  // have a unique draggable id under the shared DndContext — bare task.id
  // would collide N times for an N-week bar (dnd-kit keys draggables by id;
  // duplicates silently break all but the last-mounted one). The handler
  // recovers the real taskId from `data.taskId`.
  const draggableId = `${task.id}::wk-${segment.weekKey}`;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: draggableId,
    disabled: isRecurring,
    data: { taskId: task.id, kind: "bar" },
  });

  // ECM-Pulse commitment-timeline pattern: this-week tasks fill in the
  // accent (coral); future / past / open-ended tasks fill in the muted
  // steel blue-grey. Priority becomes a small dot indicator at the
  // start of the title rather than the bar's defining colour — keeps
  // the calendar visually cohesive with the rest of the brand palette.
  const isActiveWeek = isInCurrentIsoWeek(task.dueDate);
  const fillBg = isActiveWeek ? "var(--bar-active)" : "var(--bar-default)";
  const fillFg = isActiveWeek ? "var(--bar-active-foreground)" : "var(--bar-default-foreground)";
  const priorityColor = task.priority.color;

  const radiusLeft = leftEdge === "definite" ? "6px" : "0px";
  const radiusRight = rightEdge === "definite" ? "6px" : "0px";
  const background =
    rightEdge === "open"
      ? `linear-gradient(to right, ${fillBg} 0%, ${fillBg} 80%, transparent 100%)`
      : fillBg;

  const style: React.CSSProperties = {
    gridColumnStart: colStart,
    gridColumnEnd: colStart + colSpan,
    gridRowStart: lane + 1 + rowOffset,
    gridRowEnd: lane + 2 + rowOffset,
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
    background,
    color: fillFg,
    borderTopLeftRadius: radiusLeft,
    borderBottomLeftRadius: radiusLeft,
    borderTopRightRadius: radiusRight,
    borderBottomRightRadius: radiusRight,
    boxShadow: "0 1px 2px rgba(15, 30, 58, 0.10)",
    // Sibling cells render with z-index 0; bars at z-index 1 paint on top
    // and own the pointer events for drag/click.
    position: "relative",
    zIndex: 1,
  };

  const fullRange =
    task.dueDate
      ? `${fmt(task.startDate)} → ${fmt(task.dueDate)}`
      : `starts ${fmt(task.startDate)}, no due date`;
  const aria = `${task.name}, ${fullRange}`;

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (isDragging) return;
    onClick?.(task);
  }

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={handleClick}
      title={aria}
      aria-label={aria}
      style={style}
      {...attributes}
      {...listeners}
      className="text-left text-[11px] leading-tight px-2 py-1 truncate flex items-center gap-1.5 hover:brightness-95 hover:saturate-200 transition-[filter] cursor-grab active:cursor-grabbing touch-none font-medium"
    >
      <span
        aria-hidden="true"
        className="inline-block size-2 rounded-full shrink-0 ring-1 ring-black/10"
        style={{ background: priorityColor }}
        title={task.priority.name}
      />
      {task.isImportant && <span className="shrink-0 opacity-95">★</span>}
      {task.isUrgent && <span className="shrink-0 opacity-95">⏱</span>}
      {isRecurring && <Repeat className="size-3 shrink-0 opacity-90" aria-hidden />}
      <span className="truncate flex-1">{task.name}</span>
    </button>
  );
}
