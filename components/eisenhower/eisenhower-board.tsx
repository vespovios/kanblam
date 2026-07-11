"use client";

import { useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { EisenhowerQuadrant } from "./eisenhower-quadrant";
import { EisenhowerCardOverlay } from "./eisenhower-card";
import { TaskEditDrawer } from "@/components/tasks/task-edit-drawer";
import type { TaskRow } from "@/components/tasks/tasks-table";
import type { KanbanTaskCard } from "@/components/kanban/kanban-card";
import type { TagLite } from "@/components/tags/tag-pill";
import { QUADRANT_IDS, quadrantFlags, quadrantFor, type QuadrantId } from "@/lib/eisenhower/quadrants";

interface Props {
  initialTasks: KanbanTaskCard[];
  fullTasks: TaskRow[];
  priorities: { id: string; name: string }[];
  kanbanStages: { id: string; name: string }[];
  members: { id: string; name: string | null; email: string }[];
  projects: { id: string; name: string; code: string }[];
  /** All workspace tags + usage count, threaded to drawer. */
  allTags: (TagLite & { _count: { tasks: number } })[];
}

/**
 * Card with its derived quadrant id, computed locally from isImportant/isUrgent.
 *
 * Note: state is a flat `BoardCard[]` rather than `Record<QuadrantId, BoardCard[]>`
 * (the shape KanbanBoard uses). Eisenhower has no manual within-quadrant ordering,
 * so there's no "position" to preserve across re-group — `groupByQuadrant` is cheap
 * and keeps the single source of truth (the flag values) unambiguous.
 */
type BoardCard = KanbanTaskCard & { quadrantId: QuadrantId };

function groupByQuadrant(cards: BoardCard[]): Record<QuadrantId, BoardCard[]> {
  const out: Record<QuadrantId, BoardCard[]> = { q1: [], q2: [], q3: [], q4: [] };
  for (const c of cards) out[c.quadrantId].push(c);
  return out;
}

export function EisenhowerBoard({
  initialTasks,
  fullTasks,
  priorities,
  kanbanStages,
  members,
  projects,
  allTags,
}: Props) {
  const [cards, setCards] = useState<BoardCard[]>(() =>
    initialTasks.map((t) => ({ ...t, quadrantId: quadrantFor(t) })),
  );
  const [tasksState, setTasksState] = useState<TaskRow[]>(fullTasks);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Pointer + Keyboard sensors. Keyboard drives the a11y flow: Tab to
  // a card's grip → Space picks up → arrow keys nudge the card → Space
  // drops on the hovered quadrant → Esc cancels. Eisenhower uses
  // useDraggable (not useSortable) so the default keyboard coordinate
  // getter applies — arrow keys translate the card by 25px per press.
  // Cross-quadrant moves take several presses; better than no keyboard
  // support at all. @dnd-kit's default announcer narrates via aria-live.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const grouped = groupByQuadrant(cards);
  const activeCard = activeId ? cards.find((c) => c.id === activeId) ?? null : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragCancel() {
    setActiveId(null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const taskId = active.id as string;
    const destQuadrant = over.id as QuadrantId;
    if (!QUADRANT_IDS.includes(destQuadrant)) return;

    const moving = cards.find((c) => c.id === taskId);
    if (!moving) return;
    if (moving.quadrantId === destQuadrant) return;

    const flags = quadrantFlags(destQuadrant);
    const prevCards = cards;
    const prevTasks = tasksState;

    setCards((cs) =>
      cs.map((c) =>
        c.id === taskId
          ? { ...c, isImportant: flags.isImportant, isUrgent: flags.isUrgent, quadrantId: destQuadrant }
          : c,
      ),
    );
    setTasksState((ts) =>
      ts.map((t) =>
        t.id === taskId ? { ...t, isImportant: flags.isImportant, isUrgent: flags.isUrgent } : t,
      ),
    );

    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isImportant: flags.isImportant, isUrgent: flags.isUrgent }),
      });
      if (!res.ok) {
        setCards(prevCards);
        setTasksState(prevTasks);
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to update task");
      }
    } catch {
      setCards(prevCards);
      setTasksState(prevTasks);
      toast.error("Failed to update task");
    }
  }

  function handleTaskUpdated(updated: TaskRow) {
    const updatedCard: BoardCard = {
      id: updated.id,
      name: updated.name,
      project: updated.project,
      assignee: updated.assignee,
      priority: updated.priority,
      tags: updated.tags,
      dueDate: updated.dueDate,
      progressPct: updated.progressPct,
      subtaskTotal: updated.subtasks.length,
      subtaskCompleted: updated.subtasks.filter((s) => s.completed).length,
      progressManual: updated.progressManual,
      recurringTemplateId: updated.recurringTemplateId,
      isImportant: updated.isImportant,
      isUrgent: updated.isUrgent,
      quadrantId: quadrantFor(updated),
    };
    // Quadrants have no stored order, so filter-then-append is fine — no need
    // to preserve position (contrast KanbanBoard, which does).
    setCards((cs) => {
      const without = cs.filter((c) => c.id !== updated.id);
      return [...without, updatedCard];
    });
    setTasksState((ts) => ts.map((t) => (t.id === updated.id ? updated : t)));
  }

  function handleTaskDeleted(id: string) {
    setCards((cs) => cs.filter((c) => c.id !== id));
    setTasksState((ts) => ts.filter((t) => t.id !== id));
  }

  const openTask = tasksState.find((t) => t.id === openTaskId) ?? null;

  return (
    <>
      <DndContext
        id="eisenhower-board"
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {QUADRANT_IDS.map((qid) => (
            <EisenhowerQuadrant
              key={qid}
              id={qid}
              tasks={grouped[qid]}
              onCardClick={(id) => setOpenTaskId(id)}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeCard ? <EisenhowerCardOverlay task={activeCard} /> : null}
        </DragOverlay>
      </DndContext>

      {openTask && (
        <TaskEditDrawer
          task={openTask}
          open={true}
          onOpenChange={(v) => {
            if (!v) setOpenTaskId(null);
          }}
          priorities={priorities}
          kanbanStages={kanbanStages}
          members={members}
          projects={projects}
          allTags={allTags}
          onTaskUpdated={handleTaskUpdated}
          onTaskDeleted={handleTaskDeleted}
        />
      )}
    </>
  );
}
