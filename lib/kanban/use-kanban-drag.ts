import { useState, useMemo } from "react";
import {
  DragEndEvent,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { toast } from "sonner";
import type { KanbanStage } from "@/components/kanban/kanban-column";
import type { KanbanTaskCard } from "@/components/kanban/kanban-card";
import type { TaskRow } from "@/components/tasks/tasks-table";
import { resolveDropTarget, isNoOpDrop } from "@/lib/kanban/drop-target";
import { resolveLaneDrop } from "@/lib/kanban/resolve-lane-drop";
import { cellKey, type LaneAxis } from "@/lib/kanban/lanes";

export type BoardCard = KanbanTaskCard & { kanbanStageId: string };

/** Stage id → cards in visual order. */
export type Grouped = Record<string, BoardCard[]>;

interface Params {
  grouped: Grouped;
  setGrouped: React.Dispatch<React.SetStateAction<Grouped>>;
  tasksState: TaskRow[];
  setTasksState: React.Dispatch<React.SetStateAction<TaskRow[]>>;
  stages: KanbanStage[];
  members: { id: string; name: string | null; email: string }[];
  lane: LaneAxis;
  cells: Map<string, BoardCard[]> | null;
}

interface KanbanDrag {
  activeId: string | null;
  sensors: ReturnType<typeof useSensors>;
  onDragStart: (event: DragStartEvent) => void;
  onDragEnd: (event: DragEndEvent) => Promise<void>;
  onDragCancel: () => void;
}

/**
 * Owns the kanban-board drag dispatcher: pointer sensor, activeId for the
 * drag overlay, and the dragend handler that branches between lane-cell
 * (cross-cell) drops and column-style sortable (within-cell + none mode)
 * drops.
 *
 * Co-located here so the board file stays focused on layout/state. The
 * board still owns `grouped` / `tasksState` (drawer + create/update/delete
 * handlers also touch them), so the hook receives setters as deps rather
 * than absorbing those.
 */
export function useKanbanDrag({
  grouped,
  setGrouped,
  tasksState,
  setTasksState,
  stages,
  members,
  lane,
  cells,
}: Params): KanbanDrag {
  const [activeId, setActiveId] = useState<string | null>(null);

  // Pointer drives mouse/touch. Keyboard drives the a11y flow:
  // Tab to a card's drag handle → Space picks up → arrow keys move the
  // active card across the grid → Space drops → Esc cancels.
  // @dnd-kit's default announcer narrates the moves via aria-live for
  // screen readers.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const stageIds = useMemo(() => stages.map((s) => s.id), [stages]);

  function onDragStart(event: DragStartEvent) {
    // Lane mode uses composite sortable ids (`${taskId}::lane-${laneId}`); the
    // real task id is stashed in data.taskId. Unwrap for the overlay lookup.
    const data = event.active.data.current as { taskId?: string } | undefined;
    setActiveId(data?.taskId ?? (event.active.id as string));
  }

  function onDragCancel() {
    setActiveId(null);
  }

  async function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current as
      | { taskId?: string; stageId?: string; laneId?: string }
      | undefined;
    const activeTaskId = activeData?.taskId ?? (active.id as string);
    const overData = over.data.current as
      | { taskId?: string; stageId?: string; laneId?: string }
      | undefined;
    // Lane-mode cards register composite useSortable ids; unwrap to the real
    // task id for resolveDropTarget's same-stage list comparison.
    const overId = overData?.taskId ?? (over.id as string);

    // Same-cell drops (lane mode) fall through to the column-style sortable
    // path so within-cell reordering keeps position-aware semantics. Cross-
    // cell and lane-cell drops take the lane-aware branch below.
    const drop = resolveLaneDrop(activeData, overData);

    // Lane-cell or card-in-other-lane drop. overData carries `{stageId, laneId}`
    // either from KanbanLaneCell's useDroppable (cell drop) or KanbanCard's
    // useSortable data (card-on-card cross-cell drop). The redundant
    // overData?.stageId/laneId checks narrow TS through the helper return.
    if (drop === "cross-cell" && overData?.stageId && overData?.laneId) {
      const destStageId = overData.stageId;
      const destLaneId = overData.laneId;
      const destStage = stages.find((s) => s.id === destStageId);
      if (!destStage) return;
      const movingCard = Object.values(grouped)
        .flat()
        .find((c) => c.id === activeTaskId);
      if (!movingCard) return;

      // Tag axis: cross-lane drag is disallowed.
      if (lane === "tag") {
        const sourceTagIds = movingCard.tags.map((t) => t.id);
        if (!sourceTagIds.includes(destLaneId)) {
          toast.info("Open the task to edit tags.", {
            id: "kanban-cross-tag-disallowed",
          });
          return;
        }
      }

      // Project axis: a task belongs to exactly one project. Cross-project
      // drag is disallowed (there's no by-drag project reassignment) —
      // dragging within the same project lane to change stage still works.
      if (lane === "project") {
        if (destLaneId !== movingCard.project.id) {
          toast.info("A task can't be moved between projects by drag.", {
            id: "kanban-cross-project-disallowed",
          });
          return;
        }
      }

      const sourceStageId = (Object.keys(grouped) as string[]).find((sid) =>
        grouped[sid].some((c) => c.id === activeTaskId),
      );
      if (!sourceStageId) return;

      // Compute destination index = end of dest cell.
      const destCellCards = cells?.get(cellKey(destStageId, destLaneId)) ?? [];
      const targetIndex = destCellCards.length;

      const prevGrouped = grouped;
      const prevTasks = tasksState;

      // Optimistic update
      setGrouped((g) => {
        const next: Grouped = { ...g };
        const fromList = (g[sourceStageId] ?? []).filter(
          (c) => c.id !== activeTaskId,
        );
        const dest = [...(g[destStageId] ?? [])];
        const newCard: BoardCard =
          lane === "assignee"
            ? {
                ...movingCard,
                kanbanStageId: destStageId,
                assignee:
                  members.find((m) => m.id === destLaneId) ??
                  movingCard.assignee,
              }
            : { ...movingCard, kanbanStageId: destStageId };
        if (sourceStageId === destStageId) {
          const filtered = (g[sourceStageId] ?? []).filter(
            (c) => c.id !== activeTaskId,
          );
          filtered.splice(Math.min(targetIndex, filtered.length), 0, newCard);
          next[sourceStageId] = filtered;
        } else {
          dest.splice(Math.min(targetIndex, dest.length), 0, newCard);
          next[sourceStageId] = fromList;
          next[destStageId] = dest;
        }
        return next;
      });

      if (lane === "assignee" && destLaneId) {
        setTasksState((ts) =>
          ts.map((t) =>
            t.id === activeTaskId
              ? {
                  ...t,
                  assignee:
                    members.find((m) => m.id === destLaneId) ?? t.assignee,
                  kanbanStage: {
                    id: destStage.id,
                    name: destStage.name,
                    color: destStage.color,
                    isTerminal: destStage.isTerminal,
                  },
                }
              : t,
          ),
        );
      } else if (sourceStageId !== destStageId) {
        setTasksState((ts) =>
          ts.map((t) =>
            t.id === activeTaskId
              ? {
                  ...t,
                  kanbanStage: {
                    id: destStage.id,
                    name: destStage.name,
                    color: destStage.color,
                    isTerminal: destStage.isTerminal,
                  },
                }
              : t,
          ),
        );
      }

      try {
        const body: Record<string, unknown> = {
          kanbanStageId: destStageId,
          newIndex: targetIndex,
        };
        if (lane === "assignee") body.assigneeId = destLaneId;
        const res = await fetch(`/api/tasks/${activeTaskId}/move`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          setGrouped(prevGrouped);
          setTasksState(prevTasks);
          const data = await res.json().catch(() => ({}));
          toast.error(data.error ?? "Failed to move task");
        }
      } catch {
        setGrouped(prevGrouped);
        setTasksState(prevTasks);
        toast.error("Failed to move task");
      }
      return;
    }

    // Column-style path: none mode and lane-mode same-cell reorders. Snapshot
    // current layout as id-lists per stage for the helper.
    const tasksByStage: Record<string, string[]> = {};
    for (const sid of stageIds) {
      tasksByStage[sid] = (grouped[sid] ?? []).map((c) => c.id);
    }

    const target = resolveDropTarget(activeTaskId, overId, stageIds, tasksByStage);
    if (!target) return;

    // Find source.
    let sourceStageId: string | undefined;
    for (const sid of stageIds) {
      if (tasksByStage[sid].includes(activeTaskId)) {
        sourceStageId = sid;
        break;
      }
    }
    if (!sourceStageId) return;

    if (isNoOpDrop(sourceStageId, activeTaskId, target, tasksByStage)) return;

    const destStage = stages.find((s) => s.id === target.destStageId);
    if (!destStage) return;

    const prevGrouped = grouped;
    const prevTasks = tasksState;

    setGrouped((g) => {
      const next: Grouped = { ...g };
      if (sourceStageId === target.destStageId) {
        const list = next[sourceStageId] ?? [];
        const fromIdx = list.findIndex((c) => c.id === activeTaskId);
        next[sourceStageId] = arrayMove(list, fromIdx, target.newIndex);
      } else {
        const fromList = (g[sourceStageId] ?? []).filter((c) => c.id !== activeTaskId);
        const moving = (g[sourceStageId] ?? []).find((c) => c.id === activeTaskId);
        if (!moving) return g;
        const dest = [...(g[target.destStageId] ?? [])];
        dest.splice(target.newIndex, 0, { ...moving, kanbanStageId: target.destStageId });
        next[sourceStageId] = fromList;
        next[target.destStageId] = dest;
      }
      return next;
    });

    // Mirror the stage change in `tasksState` so the drawer sees the latest
    // kanbanStage when the user opens the task.
    if (sourceStageId !== target.destStageId) {
      setTasksState((ts) =>
        ts.map((t) =>
          t.id === activeTaskId
            ? {
                ...t,
                kanbanStage: {
                  id: destStage.id,
                  name: destStage.name,
                  color: destStage.color,
                  isTerminal: destStage.isTerminal,
                },
              }
            : t,
        ),
      );
    }

    try {
      const res = await fetch(`/api/tasks/${activeTaskId}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kanbanStageId: target.destStageId,
          newIndex: target.newIndex,
        }),
      });
      if (!res.ok) {
        setGrouped(prevGrouped);
        setTasksState(prevTasks);
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to move task");
        return;
      }
    } catch {
      setGrouped(prevGrouped);
      setTasksState(prevTasks);
      toast.error("Failed to move task");
    }
  }

  return { activeId, sensors, onDragStart, onDragEnd, onDragCancel };
}
