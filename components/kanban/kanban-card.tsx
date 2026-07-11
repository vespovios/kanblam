"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { TaskCardBody } from "@/components/tasks/task-card-body";
import { useReadOnly, READ_ONLY_CONTROL_TITLE } from "@/components/billing/read-only-provider";

export interface KanbanTaskCard {
  id: string;
  name: string;
  project: { id: string; code: string; name: string };
  assignee: { id: string; name: string | null; email: string; kind: "HUMAN" | "AGENT" } | null;
  priority: { id: string; name: string; color: string };
  tags: { id: string; name: string; color: string }[];
  dueDate: string | null;
  progressPct: number;
  subtaskTotal: number;
  subtaskCompleted: number;
  progressManual: boolean;
  recurringTemplateId: string | null;
  isImportant: boolean;
  isUrgent: boolean;
}

export function KanbanCard({
  task,
  onClick,
  stageId,
  laneId,
}: {
  task: KanbanTaskCard;
  onClick?: () => void;
  /** When set (lane mode), the card's useSortable id is composed with laneId
   *  so multi-tag tasks rendered into multiple lanes don't collide on a
   *  single id under the shared DndContext. The data payload also lets the
   *  dispatcher route card-on-card drops through the lane-cell branch. */
  stageId?: string;
  laneId?: string;
}) {
  const readOnly = useReadOnly();
  const inLane = Boolean(stageId && laneId);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: inLane ? `${task.id}::lane-${laneId}` : task.id,
      data: inLane ? { taskId: task.id, stageId, laneId } : undefined,
      disabled: readOnly,
    });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
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
      className="relative bg-card text-card-foreground rounded-md p-2 shadow-sm border border-border hover:border-primary/40 hover:shadow space-y-1.5 select-none transition-[border-color,box-shadow]"
    >
      {/* Drag handle stays visible in read-only mode (no feature hidden) but is
          disabled, non-draggable and muted, with an explanatory tooltip. */}
      <button
        type="button"
        {...(readOnly ? {} : listeners)}
        {...(readOnly ? {} : attributes)}
        disabled={readOnly}
        aria-label={readOnly ? READ_ONLY_CONTROL_TITLE : "Drag to reorder"}
        title={readOnly ? READ_ONLY_CONTROL_TITLE : undefined}
        className={`absolute top-1.5 right-1.5 p-1 rounded text-muted-foreground/80 transition-colors touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          readOnly
            ? "opacity-40 cursor-not-allowed"
            : "hover:text-foreground cursor-grab active:cursor-grabbing"
        }`}
      >
        <GripVertical className="size-3.5" />
      </button>
      <TaskCardBody task={task} />
    </div>
  );
}

/** Overlay clone rendered via `<DragOverlay>` so the dragged card escapes column `overflow` clipping. */
export function KanbanCardOverlay({ task }: { task: KanbanTaskCard }) {
  return (
    <div className="bg-card text-card-foreground rounded-md p-2 shadow-xl border border-primary/40 space-y-1.5 select-none cursor-grabbing rotate-1">
      <TaskCardBody task={task} />
    </div>
  );
}
