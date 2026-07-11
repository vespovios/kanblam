"use client";

import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { KanbanCardStack } from "./kanban-card-stack";
import type { KanbanTaskCard } from "./kanban-card";

export interface KanbanStage {
  id: string;
  name: string;
  color: string;
  order: number;
  /** Terminal stage = task is "done" (drives the list-view completion state). */
  isTerminal: boolean;
}

export function KanbanColumn({
  stage,
  tasks,
  onCardClick,
  onAddTask,
}: {
  stage: KanbanStage;
  tasks: KanbanTaskCard[];
  onCardClick: (taskId: string) => void;
  onAddTask?: (stageId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  return (
    <div
      ref={setNodeRef}
      role="region"
      aria-roledescription="kanban column"
      aria-label={`${stage.name} — ${tasks.length} task${tasks.length === 1 ? "" : "s"}`}
      className={cn(
        "flex-shrink-0 w-[270px] rounded-lg bg-muted/40 dark:bg-muted/30",
        "border border-border flex flex-col gap-2 max-h-full transition-colors",
        isOver && "border-primary/50 bg-primary/5",
      )}
    >
      {/* Column header — ECM Pulse-style: uppercase label, count chip,
          stage-coloured underline. Sits as its own band above the card
          stack so the underline tints the column from the top. */}
      <header
        className="flex items-center justify-between px-3 pt-2.5 pb-2 border-b-[3px]"
        style={{ borderBottomColor: stage.color }}
      >
        <h4 className="text-[11px] uppercase tracking-[0.08em] font-semibold text-foreground/80">
          {stage.name}
        </h4>
        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-background text-muted-foreground border border-border">
          {tasks.length}
        </span>
      </header>
      <div className="flex-1 flex flex-col gap-1.5 px-2 pb-2 min-h-0">
        <KanbanCardStack
          tasks={tasks}
          onCardClick={onCardClick}
          onAddTask={onAddTask ? () => onAddTask(stage.id) : undefined}
        />
      </div>
    </div>
  );
}
