"use client";

/**
 * Eisenhower quadrant — a droppable zone. Cards within it have no stored
 * order (contrast with KanbanColumn, which hosts a SortableContext).
 */

import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import type { QuadrantId } from "@/lib/eisenhower/quadrants";
import { QUADRANT_META } from "@/lib/eisenhower/quadrants";
import { EisenhowerCard } from "./eisenhower-card";
import type { KanbanTaskCard } from "@/components/kanban/kanban-card";

/**
 * Quadrant tints are driven by CSS variables (`--q1-tint` … `--q4-tint`)
 * defined in globals.css so each theme can supply its own values without
 * needing a runtime theme read here.
 */
const QUADRANT_TINT: Record<QuadrantId, string> = {
  q1: "var(--q1-tint)",
  q2: "var(--q2-tint)",
  q3: "var(--q3-tint)",
  q4: "var(--q4-tint)",
};

export function EisenhowerQuadrant({
  id,
  tasks,
  onCardClick,
}: {
  id: QuadrantId;
  tasks: KanbanTaskCard[];
  onCardClick: (taskId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const meta = QUADRANT_META[id];

  return (
    <div
      ref={setNodeRef}
      role="region"
      aria-roledescription="eisenhower quadrant"
      aria-label={`${meta.title} — ${meta.subtitle} — ${tasks.length} task${tasks.length === 1 ? "" : "s"}`}
      className={cn(
        "rounded-lg p-3 flex flex-col gap-2 min-h-[240px]",
        "border border-transparent transition-colors",
        isOver && "border-primary/40 bg-primary/5",
      )}
      style={{ background: QUADRANT_TINT[id] }}
    >
      <div className="flex items-baseline justify-between px-1">
        <div>
          <h4 className="text-sm font-semibold text-foreground/90">{meta.title}</h4>
          <p className="text-xs text-muted-foreground">{meta.subtitle}</p>
        </div>
        <span className="text-xs bg-background border border-border rounded-full px-2 py-px text-muted-foreground">
          {tasks.length}
        </span>
      </div>
      <div className="flex-1 space-y-1.5 overflow-y-auto">
        {tasks.length === 0 ? (
          <p className="text-xs text-muted-foreground/60 text-center py-6">Drop tasks here</p>
        ) : (
          tasks.map((t) => (
            <EisenhowerCard key={t.id} task={t} onClick={() => onCardClick(t.id)} />
          ))
        )}
      </div>
    </div>
  );
}
