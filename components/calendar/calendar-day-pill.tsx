"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { CirclePause, Repeat } from "lucide-react";
import { isInCurrentIsoWeek } from "@/lib/calendar/window";
import type { CalendarTask } from "./calendar-board";

interface Props {
  task: CalendarTask;
  onClick?: () => void;
}

export function CalendarDayPill({ task, onClick }: Props) {
  const isRecurring = task.recurringTemplateId !== null;

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    disabled: isRecurring,
    data: { taskId: task.id },
  });

  // Same urgency-driven fill as the multi-day bar segments. Priority
  // appears as a small dot indicator at the start of the title.
  const isActiveWeek = isInCurrentIsoWeek(task.dueDate);
  const fillBg = isActiveWeek ? "var(--bar-active)" : "var(--bar-default)";
  const fillFg = isActiveWeek ? "var(--bar-active-foreground)" : "var(--bar-default-foreground)";
  const priorityColor = task.priority.color;

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
    background: fillBg,
    color: fillFg,
    borderRadius: "6px",
    boxShadow: "0 1px 2px rgba(15, 30, 58, 0.10)",
    // While dragging, lift out of the cell's stacking flow so the pill
    // paints above adjacent cells as it moves across boundaries. Cells
    // create no stacking context (no z-index), so position: relative +
    // a high z-index here promotes the pill to the parent grid level.
    position: isDragging ? "relative" : undefined,
    zIndex: isDragging ? 50 : undefined,
  };

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (isDragging) return;
    onClick?.();
  }

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={handleClick}
      title={task.name}
      style={style}
      {...attributes}
      {...listeners}
      className="w-full text-left text-[11px] leading-tight px-1.5 py-1 truncate flex items-center gap-1.5 hover:brightness-95 hover:saturate-200 transition-[filter] cursor-grab active:cursor-grabbing touch-none font-medium"
    >
      <span
        aria-hidden="true"
        className="inline-block size-2 rounded-full shrink-0 ring-1 ring-black/10"
        style={{ background: priorityColor }}
        title={task.priority.name}
      />
      {task.isImportant && <span className="shrink-0 opacity-95">★</span>}
      {task.isUrgent && <span className="shrink-0 opacity-95">⏱</span>}
      {task.recurringTemplateId && (
        <Repeat className="size-3 shrink-0 opacity-90" aria-label="Recurring task" />
      )}
      {!task.isImportant && !task.isUrgent && !task.recurringTemplateId && (
        <CirclePause className="size-3 shrink-0 opacity-80" aria-label="Eliminate" />
      )}
      <span className="truncate flex-1">{task.name}</span>
    </button>
  );
}
