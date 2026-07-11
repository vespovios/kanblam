"use client";

import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { KanbanCard, type KanbanTaskCard } from "./kanban-card";

interface Props {
  tasks: KanbanTaskCard[];
  onCardClick: (taskId: string) => void;
  onAddTask?: () => void;
  /** Empty-cell hint text. Default: "Drop tasks here". */
  emptyText?: string;
  /** Lane-cell coordinates. When set, cards in this stack register
   *  composite useSortable ids (`${task.id}::lane-${laneId}`) so multi-tag
   *  tasks rendered into multiple cells don't collide on a single id under
   *  the shared DndContext. The card data payload also lets the dispatcher
   *  route card-on-card drops through the lane-cell branch. */
  stageId?: string;
  laneId?: string;
}

/**
 * Inner card stack used by both <KanbanColumn> (full-stage column) and
 * <KanbanLaneCell> (single (stage, lane) cell). Owns the sortable context
 * for its own task list and renders the per-cell "+ Add task" affordance.
 */
export function KanbanCardStack({ tasks, onCardClick, onAddTask, emptyText = "Drop tasks here", stageId, laneId }: Props) {
  const inLane = Boolean(stageId && laneId);
  const itemIds = inLane
    ? tasks.map((t) => `${t.id}::lane-${laneId}`)
    : tasks.map((t) => t.id);
  return (
    <>
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
          {tasks.length === 0 ? (
            <p className="text-xs text-muted-foreground/60 text-center py-6">{emptyText}</p>
          ) : (
            tasks.map((t) => (
              <KanbanCard
                key={inLane ? `${t.id}::lane-${laneId}` : t.id}
                task={t}
                onClick={() => onCardClick(t.id)}
                stageId={stageId}
                laneId={laneId}
              />
            ))
          )}
        </div>
      </SortableContext>
      {onAddTask && (
        <button
          type="button"
          onClick={onAddTask}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1.5 rounded hover:bg-background transition-colors"
        >
          <Plus className="size-3.5" />
          Add task
        </button>
      )}
    </>
  );
}
