"use client";

import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { KanbanCardStack } from "./kanban-card-stack";
import type { KanbanTaskCard } from "./kanban-card";

interface Props {
  stageId: string;
  laneId: string;
  /** Tints the cell background with the stage color. */
  stageColor: string;
  tasks: KanbanTaskCard[];
  onCardClick: (taskId: string) => void;
  onAddTask?: () => void;
}

export function KanbanLaneCell({
  stageId,
  laneId,
  stageColor,
  tasks,
  onCardClick,
  onAddTask,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({
    id: `lane-cell-${stageId}-${laneId}`,
    data: { stageId, laneId },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-md p-2 flex flex-col gap-2 min-h-[100px] bg-muted/40 dark:bg-muted/30",
        "border-l-[3px] border-y border-r border-border transition-colors",
        isOver && "border-primary/50 bg-primary/5",
      )}
      style={{ borderLeftColor: stageColor }}
    >
      <KanbanCardStack
        tasks={tasks}
        onCardClick={onCardClick}
        onAddTask={onAddTask}
        emptyText=""
        stageId={stageId}
        laneId={laneId}
      />
    </div>
  );
}
