"use client";

/**
 * Eisenhower card — draggable between quadrants only; no within-quadrant ordering.
 * Kanban uses `useSortable` because its cards have a manual `kanbanOrder`; here
 * the drop target is a quadrant (flags), so plain `useDraggable` suffices.
 */

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { TaskCardBody } from "@/components/tasks/task-card-body";
import type { KanbanTaskCard } from "@/components/kanban/kanban-card";

export function EisenhowerCard({
  task,
  onClick,
}: {
  task: KanbanTaskCard;
  onClick?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={(e) => {
        if (!isDragging) onClick?.();
        e.stopPropagation();
      }}
      role="button"
      aria-roledescription="task card"
      aria-label={task.name}
      // cursor-pointer + hover affordances match KanbanCard. Without them the
      // card looks drag-only even though click-to-open has worked since v0.4;
      // Hermes' QA flagged this exact discoverability gap.
      className="relative bg-card rounded-md p-2.5 shadow-sm border border-border/50 space-y-1.5 select-none cursor-pointer hover:border-primary/40 hover:shadow transition-[border-color,box-shadow]"
    >
      <button
        type="button"
        {...listeners}
        {...attributes}
        aria-label="Drag to another quadrant"
        className="absolute top-1.5 right-1.5 p-1 rounded text-muted-foreground opacity-70 hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <GripVertical className="size-3.5" />
      </button>
      <TaskCardBody task={task} />
    </div>
  );
}

export function EisenhowerCardOverlay({ task }: { task: KanbanTaskCard }) {
  return (
    <div className="bg-card rounded-md p-2.5 shadow-xl border border-border/50 space-y-1.5 select-none cursor-grabbing rotate-1">
      <TaskCardBody task={task} />
    </div>
  );
}
