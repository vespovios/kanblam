"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import { KanbanColumn, type KanbanStage } from "./kanban-column";
import { KanbanCardOverlay } from "./kanban-card";
import { KanbanLaneCell } from "./kanban-lane-cell";
import { KanbanLaneSummary } from "./kanban-lane-summary";
import { TaskEditDrawer } from "@/components/tasks/task-edit-drawer";
import { TaskCreateDialog } from "@/components/tasks/task-create-dialog";
import type { TaskRow } from "@/components/tasks/tasks-table";
import type { TagLite } from "@/components/tags/tag-pill";
import {
  computeLanes,
  groupByStageAndLane,
  untaggedTaskCount,
  cellKey,
  type LaneAxis,
} from "@/lib/kanban/lanes";
import { useCollapsedLanes } from "@/lib/kanban/use-collapsed-lanes";
import { useKanbanDrag, type BoardCard, type Grouped } from "@/lib/kanban/use-kanban-drag";

function groupByStage(stages: KanbanStage[], cards: BoardCard[]): Grouped {
  const out: Grouped = {};
  for (const s of stages) out[s.id] = [];
  for (const c of cards) {
    (out[c.kanbanStageId] ??= []).push(c);
  }
  return out;
}

function toBoardCard(t: TaskRow): BoardCard {
  return {
    id: t.id,
    name: t.name,
    project: t.project,
    assignee: t.assignee,
    priority: t.priority,
    tags: t.tags,
    dueDate: t.dueDate,
    progressPct: t.progressPct,
    subtaskTotal: t.subtasks.length,
    subtaskCompleted: t.subtasks.filter((s) => s.completed).length,
    progressManual: t.progressManual,
    recurringTemplateId: t.recurringTemplateId,
    isImportant: t.isImportant,
    isUrgent: t.isUrgent,
    kanbanStageId: t.kanbanStage.id,
  };
}

interface Props {
  initialTasks: BoardCard[];
  fullTasks: TaskRow[];
  stages: KanbanStage[];
  priorities: { id: string; name: string }[];
  kanbanStages: { id: string; name: string }[];
  members: { id: string; name: string | null; email: string }[];
  projects: { id: string; name: string; code: string }[];
  /** All workspace tags + usage count, threaded to drawer + create dialog. */
  allTags: (TagLite & { _count: { tasks: number } })[];
  /** Lane grouping axis. "none" = existing single-axis layout. */
  lane: LaneAxis;
  /** Current user id — used as the default assignee in the create dialog. */
  currentUserId: string;
}

export function KanbanBoard({
  initialTasks,
  fullTasks,
  stages,
  priorities,
  kanbanStages,
  members,
  projects,
  allTags,
  lane,
  currentUserId,
}: Props) {
  const [grouped, setGrouped] = useState<Grouped>(() => groupByStage(stages, initialTasks));
  // `fullTasks` is also held locally so that drawer reads see the latest
  // kanbanStage / progress / etc. after a drag or edit — without relying on
  // a server re-render to update the prop.
  const [tasksState, setTasksState] = useState<TaskRow[]>(fullTasks);
  // Sync server props into local state when the parent re-renders with fresh
  // arrays (e.g. after router.refresh() from realtime sync). Each server
  // render produces new array literals, so reference equality is a reliable
  // change signal between refreshes.
  const lastInitialTasksRef = useRef(initialTasks);
  const lastFullTasksRef = useRef(fullTasks);
  useEffect(() => {
    if (lastInitialTasksRef.current !== initialTasks) {
      lastInitialTasksRef.current = initialTasks;
      setGrouped(groupByStage(stages, initialTasks));
    }
  }, [initialTasks, stages]);
  useEffect(() => {
    if (lastFullTasksRef.current !== fullTasks) {
      lastFullTasksRef.current = fullTasks;
      setTasksState(fullTasks);
    }
  }, [fullTasks]);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [addingStageId, setAddingStageId] = useState<string | null>(null);

  const lanes = useMemo(
    () => computeLanes(lane, members, allTags, projects),
    [lane, members, allTags, projects],
  );

  // Per-axis collapsed-swimlane state (localStorage-backed).
  const { collapsed: collapsedLanes, toggle: toggleLane } = useCollapsedLanes(lane);

  // For lane-mode: grid-cell occupancy. For single-axis: unused (we keep
  // the existing column-grouped state above). Pass the FULL BoardCard
  // through the generic helper so cells contain everything KanbanCard
  // needs (project, priority, assignee, etc) — not just LaneInputTask
  // fields. kanbanOrder is set to 0 because ordering is already preserved
  // in the upstream `grouped` array order.
  const cells = useMemo(() => {
    if (lane === "none") return null;
    const allCards = Object.values(grouped).flat();
    return groupByStageAndLane(
      allCards.map((c) => ({ ...c, kanbanOrder: 0 })),
      stages,
      lanes,
      lane,
    );
  }, [lane, grouped, stages, lanes]);

  const { activeId, sensors, onDragStart, onDragEnd, onDragCancel } = useKanbanDrag({
    grouped,
    setGrouped,
    tasksState,
    setTasksState,
    stages,
    members,
    lane,
    cells,
  });

  // Untagged-banner count
  const untaggedCount = useMemo(() => {
    if (lane !== "tag") return 0;
    const allCards = Object.values(grouped).flat();
    return untaggedTaskCount(
      allCards.map((c) => ({
        id: c.id,
        kanbanStageId: c.kanbanStageId,
        kanbanOrder: 0,
        assignee: null,
        tags: c.tags,
        project: c.project,
      })),
      lane,
    );
  }, [lane, grouped]);

  // Banner "Switch to Stage view" link target — drops ?lane= but keeps the
  // rest of the URL state (project / assignee / tag filters etc).
  const searchParams = useSearchParams();
  const noLaneHref = useMemo(() => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("lane");
    const qs = sp.toString();
    return qs ? `?${qs}` : "?";
  }, [searchParams]);

  const activeCard = activeId
    ? Object.values(grouped).flat().find((c) => c.id === activeId) ?? null
    : null;

  // Drawer → board sync after a successful PATCH. Preserves column position
  // when stage didn't change; appends to destination when it did.
  function handleTaskUpdated(updated: TaskRow) {
    const destStage = updated.kanbanStage.id;
    const newCard = toBoardCard(updated);

    setGrouped((g) => {
      const next: Grouped = {};
      let wasInDest = false;
      for (const sid of Object.keys(g)) {
        if (sid === destStage) {
          next[sid] = g[sid].map((c) => {
            if (c.id === updated.id) {
              wasInDest = true;
              return newCard;
            }
            return c;
          });
        } else {
          next[sid] = g[sid].filter((c) => c.id !== updated.id);
        }
      }
      if (!wasInDest) {
        next[destStage] = [...(next[destStage] ?? []), newCard];
      }
      return next;
    });

    setTasksState((ts) => ts.map((t) => (t.id === updated.id ? updated : t)));
  }

  function handleTaskDeleted(id: string) {
    setGrouped((g) => {
      const next: Grouped = {};
      for (const sid of Object.keys(g)) {
        next[sid] = g[sid].filter((c) => c.id !== id);
      }
      return next;
    });
    setTasksState((ts) => ts.filter((t) => t.id !== id));
  }

  function handleTaskCreated(created: TaskRow) {
    const destStage = created.kanbanStage.id;
    const newCard = toBoardCard(created);
    setGrouped((g) => {
      const next: Grouped = { ...g };
      next[destStage] = [...(g[destStage] ?? []), newCard];
      return next;
    });
    setTasksState((ts) => [...ts, created]);
  }

  const openTask = tasksState.find((t) => t.id === openTaskId) ?? null;

  return (
    <>
      <DndContext
        id="kanban-board"
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        {lane === "tag" && untaggedCount > 0 && (
          <div
            role="status"
            aria-live="polite"
            className="mb-3 rounded-md border border-amber-300/40 bg-amber-50/30 px-3 py-2 text-sm text-amber-800"
          >
            {untaggedCount} untagged task{untaggedCount === 1 ? "" : "s"} hidden in Tag view.{" "}
            <Link href={noLaneHref} className="underline">
              Switch to Stage view
            </Link>{" "}
            to see them.
          </div>
        )}

        {lane === "none" ? (
          // The wrapper is position:relative so the right-edge fade
          // overlay can sit on top of the scroll container without
          // affecting layout. The fade visually signals "more columns
          // to the right" — Hermes flagged that the rightmost column
          // getting cut off wasn't obvious as scrollable content.
          <div className="relative">
            <div
              className="flex gap-3 overflow-x-auto pb-2"
              style={{ minHeight: "60vh" }}
            >
              {stages.map((stage) => (
                <KanbanColumn
                  key={stage.id}
                  stage={stage}
                  tasks={grouped[stage.id] ?? []}
                  onCardClick={(id) => setOpenTaskId(id)}
                  onAddTask={(stageId) => setAddingStageId(stageId)}
                />
              ))}
            </div>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-0 right-0 h-full w-8 bg-gradient-to-r from-transparent to-background"
            />
          </div>
        ) : (
          // Lane mode: render only the 2D grid even on small viewports.
          // Why: the spec calls for mobile to silently fall back to single-axis,
          // but rendering BOTH layouts (CSS-only swap) registers each
          // task's useSortable id twice under a single DndContext, which
          // dnd-kit treats as undefined behavior in collision detection.
          // Mobile users see the 2D grid horizontally-scrolled. A proper
          // matchMedia-based one-tree-only fallback is a future polish.
          <div
            className="overflow-x-auto pb-2 [mask-image:linear-gradient(to_right,black_calc(100%-32px),transparent)]"
            style={{
              display: "grid",
              gridTemplateColumns: `160px repeat(${stages.length}, minmax(220px, 1fr))`,
              gap: "8px",
              minHeight: "60vh",
            }}
          >
            {/* Header row */}
            <div key="hdr-empty" />
            {stages.map((stage) => (
              <div
                key={`hdr-${stage.id}`}
                className="px-2 py-1.5 rounded-md text-[11px] uppercase tracking-[0.08em] font-semibold text-foreground/80 bg-muted/40 border-b-[3px] flex items-center justify-between"
                style={{ borderBottomColor: stage.color }}
              >
                <span>{stage.name}</span>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-background text-muted-foreground border border-border">
                  {(grouped[stage.id] ?? []).length}
                </span>
              </div>
            ))}

            {/* Lane rows */}
            {lanes.map((laneRow) => {
              const isCollapsed = collapsedLanes.has(laneRow.id);
              // Full label for tooltip + screen readers (the visible label
              // may be split across two lines for project lanes).
              const fullLabel = laneRow.sublabel
                ? `${laneRow.label} — ${laneRow.sublabel}`
                : laneRow.label;
              return (
                <Fragment key={`row-${laneRow.id}`}>
                  {/* Whole lane label cell is the collapse toggle — click
                      anywhere in the left column to fold/unfold the lane. */}
                  <button
                    type="button"
                    onClick={() => toggleLane(laneRow.id)}
                    aria-expanded={!isCollapsed}
                    aria-label={
                      isCollapsed
                        ? `Expand ${fullLabel} lane`
                        : `Collapse ${fullLabel} lane`
                    }
                    title={fullLabel}
                    className="flex items-start gap-1.5 px-2 py-2 sticky left-0 bg-background border-r text-left hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                  >
                    <span
                      aria-hidden="true"
                      className="shrink-0 mt-0.5 text-muted-foreground"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="size-3.5" />
                      ) : (
                        <ChevronDown className="size-3.5" />
                      )}
                    </span>
                    <span className="min-w-0 leading-snug">
                      <span className="block text-xs font-semibold truncate">
                        {laneRow.label}
                      </span>
                      {laneRow.sublabel && (
                        <span className="block text-[11px] text-muted-foreground leading-tight line-clamp-2">
                          {laneRow.sublabel}
                        </span>
                      )}
                    </span>
                  </button>
                  {stages.map((stage) => {
                    const cellCards =
                      cells?.get(cellKey(stage.id, laneRow.id)) ?? [];
                    return isCollapsed ? (
                      <KanbanLaneSummary
                        key={`sum-${stage.id}-${laneRow.id}`}
                        tasks={cellCards}
                      />
                    ) : (
                      <KanbanLaneCell
                        key={`cell-${stage.id}-${laneRow.id}`}
                        stageId={stage.id}
                        laneId={laneRow.id}
                        stageColor={stage.color}
                        tasks={cellCards}
                        onCardClick={(id) => setOpenTaskId(id)}
                        onAddTask={() =>
                          setAddingStageId(`${stage.id}::${laneRow.id}`)
                        }
                      />
                    );
                  })}
                </Fragment>
              );
            })}
          </div>
        )}
        <DragOverlay dropAnimation={null}>
          {activeCard ? <KanbanCardOverlay task={activeCard} /> : null}
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

      <TaskCreateDialog
        projects={projects}
        priorities={priorities}
        kanbanStages={kanbanStages}
        members={members}
        allTags={allTags}
        currentUserId={currentUserId}
        renderTrigger={false}
        open={addingStageId !== null}
        onOpenChange={(v) => {
          if (!v) setAddingStageId(null);
        }}
        defaultValues={(() => {
          if (!addingStageId) return undefined;
          if (!addingStageId.includes("::")) return { kanbanStageId: addingStageId };
          const [stageId, laneId] = addingStageId.split("::");
          if (lane === "assignee") return { kanbanStageId: stageId, assigneeId: laneId };
          if (lane === "tag") return { kanbanStageId: stageId, tagIds: [laneId] };
          if (lane === "project") return { kanbanStageId: stageId, projectId: laneId };
          return { kanbanStageId: stageId };
        })()}
        onTaskCreated={handleTaskCreated}
      />
    </>
  );
}
