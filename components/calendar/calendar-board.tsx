"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { visibleWindow } from "@/lib/calendar/window";
import { classifyTask } from "@/lib/calendar/bars";
import { TaskCreateDialog } from "@/components/tasks/task-create-dialog";
import { TaskEditDrawer } from "@/components/tasks/task-edit-drawer";
import type { TaskRow } from "@/components/tasks/tasks-table";
import type { TagLite } from "@/components/tags/tag-pill";
import { CalendarNav } from "./calendar-nav";
import { MonthGrid } from "./month-grid";
import { WeekGrid } from "./week-grid";
import { MobileDayList } from "./mobile-day-list";

export interface CalendarTask {
  id: string;
  name: string;
  description: string | null;
  project: { id: string; name: string; code: string };
  assignee: { id: string; name: string | null; email: string } | null;
  priority: { id: string; name: string; color: string; order: number };
  kanbanStage: { id: string; name: string; color: string; isTerminal: boolean };
  tags: { id: string; name: string; color: string }[];
  subtasks: { id: string; title: string; completed: boolean; position: number }[];
  progressManual: boolean;
  startDate: string | null;
  dueDate: string | null;
  progressPct: number;
  recurringTemplateId: string | null;
  isImportant: boolean;
  isUrgent: boolean;
}

export interface CalendarHoliday {
  id: string;
  name: string;
  date: string;
}

interface Props {
  view: "month" | "week";
  referenceDateIso: string;
  tasks: CalendarTask[];
  holidays: CalendarHoliday[];
  workingDays: number[];
  projects: { id: string; name: string; code: string }[];
  members: { id: string; name: string | null; email: string }[];
  priorities: { id: string; name: string; order: number }[];
  kanbanStages: { id: string; name: string }[];
  /** All workspace tags + usage count, threaded to drawer + create dialog. */
  allTags: (TagLite & { _count: { tasks: number } })[];
  /** Current user id — used as the default assignee in the create dialog. */
  currentUserId: string;
  /** Pre-fill the create-task dialog with this project when the user
   *  has filtered to a single project via the global filter strip.
   *  Other global filters (assignee, tags, completed) aren't threaded
   *  here — they only need to affect the rendered task list, which the
   *  page does server-side. */
  filterProjectId: string | null;
}

function toTaskRow(t: CalendarTask): TaskRow {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    project: t.project,
    assignee: t.assignee,
    priority: t.priority,
    kanbanStage: t.kanbanStage,
    tags: t.tags,
    subtasks: t.subtasks,
    progressManual: t.progressManual,
    startDate: t.startDate,
    dueDate: t.dueDate,
    progressPct: t.progressPct,
    recurringTemplateId: t.recurringTemplateId,
    isImportant: t.isImportant,
    isUrgent: t.isUrgent,
  };
}

export function CalendarBoard(props: Props) {
  const router = useRouter();
  const referenceDate = new Date(props.referenceDateIso + "T00:00:00.000Z");
  const win = visibleWindow(props.view, referenceDate);

  const [tasksState, setTasksState] = useState<CalendarTask[]>(props.tasks);
  // Sync server-provided tasks into local state when the parent re-renders
  // with a fresh array (e.g. after router.refresh() from realtime sync).
  // Reference equality is sufficient: each server render produces a new
  // array literal; between refreshes the reference is stable.
  const lastTasksRef = useRef(props.tasks);
  useEffect(() => {
    if (lastTasksRef.current !== props.tasks) {
      lastTasksRef.current = props.tasks;
      setTasksState(props.tasks);
    }
  }, [props.tasks]);
  const [createForDate, setCreateForDate] = useState<Date | null>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  // 5px activation distance lets a quick click open the drawer without
  // dnd-kit eating it as a drag start. Same pattern as kanban + eisenhower.
  // KeyboardSensor: Tab to a calendar pill → Space picks up → arrow keys
  // nudge → Space drops on the hovered day cell. Calendar uses useDraggable
  // (not useSortable) so default 25px-per-press coords apply. @dnd-kit's
  // default announcer narrates via aria-live.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const openTask = openTaskId ? tasksState.find((t) => t.id === openTaskId) ?? null : null;

  function handleEmptyClick(date: Date) {
    setCreateForDate(date);
  }

  function handleTaskClick(task: CalendarTask) {
    setOpenTaskId(task.id);
  }

  function handleDialogChange(open: boolean) {
    if (!open) setCreateForDate(null);
  }

  function handleTaskCreated() {
    setCreateForDate(null);
    router.refresh();
  }

  function handleDrawerOpenChange(open: boolean) {
    if (!open) setOpenTaskId(null);
  }

  function handleTaskUpdated(updated: TaskRow) {
    // TaskRow doesn't carry priority.order; look it up so the calendar's
    // sort-by-priority-order keeps working after an inline edit.
    const priorityOrder =
      props.priorities.find((p) => p.id === updated.priority.id)?.order ?? 0;
    setTasksState((prev) =>
      prev.map((t) =>
        t.id === updated.id
          ? {
              id: updated.id,
              name: updated.name,
              description: updated.description,
              project: updated.project,
              assignee: updated.assignee,
              priority: { ...updated.priority, order: priorityOrder },
              kanbanStage: updated.kanbanStage,
              tags: updated.tags,
              subtasks: updated.subtasks,
              progressManual: updated.progressManual,
              startDate: updated.startDate,
              dueDate: updated.dueDate,
              progressPct: updated.progressPct,
              recurringTemplateId: updated.recurringTemplateId,
              isImportant: updated.isImportant,
              isUrgent: updated.isUrgent,
            }
          : t,
      ),
    );
    router.refresh();
  }

  function handleTaskDeleted(id: string) {
    setTasksState((prev) => prev.filter((t) => t.id !== id));
    setOpenTaskId(null);
    router.refresh();
  }

  async function patchAndHandle(
    taskId: string,
    body: Record<string, string | null>,
    previous: CalendarTask[],
  ) {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setTasksState(previous);
        toast.error(data.error ?? "Reschedule failed");
        return;
      }
      router.refresh();
    } catch (e) {
      setTasksState(previous);
      toast.error(e instanceof Error ? e.message : "Failed to reschedule task");
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    // Bars use a per-week composite id (`${task.id}::wk-${weekKey}`) to keep
    // each week's segment unique under the shared DndContext, but stash the
    // real taskId on `data.taskId`. Pills still use bare task.id with no
    // data.taskId; the fallback covers them.
    const taskId =
      (event.active.data.current?.taskId as string | undefined) ?? (event.active.id as string);
    const targetDateKey = event.over?.data.current?.dateKey as string | undefined;
    if (!targetDateKey) return;

    const task = tasksState.find((t) => t.id === taskId);
    if (!task) return;
    if (task.recurringTemplateId) return; // double safety; useDraggable is already disabled

    const cls = classifyTask({ id: task.id, startDate: task.startDate, dueDate: task.dueDate });
    const previous = tasksState;

    if (cls === "single-pill") {
      const startK = task.startDate?.slice(0, 10) ?? null;
      const dueK = task.dueDate?.slice(0, 10) ?? null;
      // No-op for both subcases: a both-set-equal pill drop on its current
      // due date shifts neither date; a due-only drop on the same day stays put.
      if (dueK === targetDateKey) return;
      const newDueIso = `${targetDateKey}T00:00:00.000Z`;

      if (startK !== null && dueK !== null && startK === dueK) {
        // Both-set-equal pill: shift both dates together (keep the couple).
        const newStartIso = `${targetDateKey}T00:00:00.000Z`;
        setTasksState((prev) =>
          prev.map((t) =>
            t.id === taskId ? { ...t, startDate: newStartIso, dueDate: newDueIso } : t,
          ),
        );
        await patchAndHandle(taskId, { startDate: targetDateKey, dueDate: targetDateKey }, previous);
      } else {
        // Due-only pill: pre-existing reschedule semantics.
        setTasksState((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, dueDate: newDueIso } : t)),
        );
        await patchAndHandle(taskId, { dueDate: targetDateKey }, previous);
      }
      return;
    }

    if (cls === "open-bar") {
      const startK = task.startDate!.slice(0, 10);
      if (startK === targetDateKey) return;
      const newStartIso = `${targetDateKey}T00:00:00.000Z`;
      setTasksState((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, startDate: newStartIso } : t)),
      );
      await patchAndHandle(taskId, { startDate: targetDateKey }, previous);
      return;
    }

    if (cls === "multi-bar") {
      // Delta is target - startDate (segment.startDate equals task.startDate).
      const startMs = new Date(task.startDate!).getTime();
      const dueMs = new Date(task.dueDate!).getTime();
      const targetMs = new Date(`${targetDateKey}T00:00:00.000Z`).getTime();
      const deltaMs = targetMs - startMs;
      if (deltaMs === 0) return;
      const newStartMs = startMs + deltaMs;
      const newDueMs = dueMs + deltaMs;
      const newStartIso = new Date(newStartMs).toISOString();
      const newDueIso = new Date(newDueMs).toISOString();
      const newStartKey = newStartIso.slice(0, 10);
      const newDueKey = newDueIso.slice(0, 10);

      setTasksState((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, startDate: newStartIso, dueDate: newDueIso } : t,
        ),
      );
      await patchAndHandle(taskId, { startDate: newStartKey, dueDate: newDueKey }, previous);
      return;
    }
    // cls === "hidden" → no draggable rendered, so nothing to do.
  }

  return (
    <DndContext
      id="calendar-dnd"
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-4">
        <CalendarNav
          view={props.view}
          referenceDate={referenceDate}
          weekStart={props.view === "week" ? win.from : null}
        />
        {/* Desktop grid (md and up) */}
        <div className="hidden sm:block">
          {props.view === "month" ? (
            <MonthGrid
              referenceDate={referenceDate}
              tasks={tasksState}
              holidays={props.holidays}
              workingDays={props.workingDays}
              onEmptyClick={handleEmptyClick}
              onTaskClick={handleTaskClick}
            />
          ) : (
            <WeekGrid
              referenceDate={referenceDate}
              tasks={tasksState}
              holidays={props.holidays}
              workingDays={props.workingDays}
              onEmptyClick={handleEmptyClick}
              onTaskClick={handleTaskClick}
            />
          )}
        </div>

        {/* Mobile agenda (below md) */}
        <div className="block sm:hidden">
          <MobileDayList
            view={props.view}
            referenceDate={referenceDate}
            tasks={tasksState}
            holidays={props.holidays}
            onTaskClick={handleTaskClick}
          />
        </div>
        {tasksState.length === 0 && (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <p className="text-muted-foreground">No tasks scheduled in this period.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Click any day to create one, or head to{" "}
              <a href="/tasks" className="underline hover:text-foreground">/tasks</a>.
            </p>
          </div>
        )}
        {createForDate && (
          <TaskCreateDialog
            projects={props.projects}
            priorities={props.priorities}
            kanbanStages={props.kanbanStages}
            members={props.members}
            allTags={props.allTags}
            currentUserId={props.currentUserId}
            renderTrigger={false}
            open={true}
            onOpenChange={handleDialogChange}
            onTaskCreated={handleTaskCreated}
            defaultValues={{
              dueDate: createForDate.toISOString().slice(0, 10),
              projectId: props.filterProjectId ?? props.projects[0]?.id ?? "",
            }}
          />
        )}
        {openTask && (
          <TaskEditDrawer
            task={toTaskRow(openTask)}
            open={true}
            onOpenChange={handleDrawerOpenChange}
            priorities={props.priorities}
            kanbanStages={props.kanbanStages}
            members={props.members}
            projects={props.projects}
            allTags={props.allTags}
            onTaskUpdated={handleTaskUpdated}
            onTaskDeleted={handleTaskDeleted}
          />
        )}
      </div>
    </DndContext>
  );
}
