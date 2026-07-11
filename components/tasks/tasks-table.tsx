"use client";

import { useState, type MouseEvent as ReactMouseEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CircleIcon, CircleCheckIcon, CircleXIcon } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TaskPriorityBadge } from "./task-priority-badge";
import { TaskStageBadge } from "./task-stage-badge";
import { TaskGlyphs } from "./task-glyphs";
import { TaskEditDrawer } from "./task-edit-drawer";
import { ProgressBar } from "@/components/ui/progress-bar";
import { TagPill, type TagLite } from "@/components/tags/tag-pill";
import { formatShortDate } from "@/lib/dates/format";
import {
  stageKind,
  isDoneStage,
  isCancelledStage,
  findCompleteTarget,
  findReopenTarget,
} from "@/lib/tasks/stage-status";

/** Stage with the fields the table needs: identity, badge color, and the two
 *  flags that drive done/cancelled state + the complete/reopen targets. */
export interface StageOption {
  id: string;
  name: string;
  color: string;
  isTerminal: boolean;
  order: number;
}

export interface TaskRow {
  id: string;
  name: string;
  description: string | null;
  project: { id: string; code: string; name: string };
  assignee: { id: string; name: string | null; email: string } | null;
  priority: { id: string; name: string; color: string };
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

interface Props {
  tasks: TaskRow[];
  priorities: { id: string; name: string }[];
  kanbanStages: StageOption[];
  members: { id: string; name: string | null; email: string }[];
  projects: { id: string; name: string; code: string }[];
  /** All workspace tags + usage count, threaded to drawer + create dialog. */
  allTags: (TagLite & { _count: { tasks: number } })[];
}

export function TasksTable({ tasks, priorities, kanbanStages, members, projects, allTags }: Props) {
  // URL-driven drawer state. ?taskId=… is the source of truth so the
  // drawer-open state survives F5, deep-links from elsewhere (DayDash rows),
  // and back-button navigation. Closing the drawer strips the param;
  // opening writes it via router.replace (no history pollution per row click).
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const openTaskId = sp.get("taskId");
  const openTask = openTaskId ? tasks.find((t) => t.id === openTaskId) ?? null : null;

  function setOpenTaskId(id: string | null) {
    const params = new URLSearchParams(sp);
    if (id) params.set("taskId", id);
    else params.delete("taskId");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  // Completion toggle. "Done" is a terminal stage; clicking the leading control
  // moves an active task INTO the terminal stage, or a done/cancelled task back
  // to the first active stage. Optimistic: we render the target stage right away
  // and reconcile via router.refresh() (the PATCH fires the workspace SSE too).
  const completeTarget = findCompleteTarget(kanbanStages);
  const reopenTarget = findReopenTarget(kanbanStages);
  const [overrides, setOverrides] = useState<Record<string, StageOption>>({});
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  async function toggleComplete(t: TaskRow, e: ReactMouseEvent) {
    e.stopPropagation(); // don't open the drawer
    const current = overrides[t.id] ?? t.kanbanStage;
    const markingDone = !isDoneStage(current) && !isCancelledStage(current);
    const target = markingDone ? completeTarget : reopenTarget;
    if (!target) {
      toast.error(markingDone ? 'No "Completed" stage to move into' : "No active stage to reopen into");
      return;
    }
    setBusyIds((prev) => new Set(prev).add(t.id));
    setOverrides((prev) => ({ ...prev, [t.id]: target }));
    try {
      const res = await fetch(`/api/tasks/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kanbanStageId: target.id }),
      });
      if (!res.ok) throw new Error("patch failed");
      router.refresh();
    } catch {
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[t.id];
        return next;
      });
      toast.error("Couldn't update the task");
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(t.id);
        return next;
      });
    }
  }

  if (tasks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center">
        <p className="text-muted-foreground">No tasks match the current filters.</p>
      </div>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Task</TableHead>
            <TableHead>Project</TableHead>
            <TableHead>Tags</TableHead>
            <TableHead>Assignee</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead className="w-36">Progress</TableHead>
            <TableHead>Due</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((t) => {
            const stage = overrides[t.id] ?? t.kanbanStage;
            const kind = stageKind(stage);
            const busy = busyIds.has(t.id);
            const control =
              kind === "done"
                ? { Icon: CircleCheckIcon, cls: "text-green-600", label: "Reopen task" }
                : kind === "cancelled"
                  ? { Icon: CircleXIcon, cls: "text-muted-foreground", label: "Reopen task" }
                  : { Icon: CircleIcon, cls: "text-muted-foreground/60 hover:text-foreground", label: "Mark complete" };
            return (
            <TableRow
              key={t.id}
              className={`cursor-pointer ${kind === "active" ? "" : "opacity-60"}`}
              onClick={() => setOpenTaskId(t.id)}
            >
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => toggleComplete(t, e)}
                    disabled={busy}
                    aria-label={control.label}
                    title={control.label}
                    className={`shrink-0 transition-colors disabled:opacity-50 ${control.cls}`}
                  >
                    <control.Icon className="h-4 w-4" />
                  </button>
                  <TaskGlyphs
                    isImportant={t.isImportant}
                    isUrgent={t.isUrgent}
                    recurringTemplateId={t.recurringTemplateId}
                    variant="inline"
                  />
                  <span title={t.name} className={kind === "cancelled" ? "line-through" : undefined}>
                    {t.name}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <Link
                  href={`/projects/${t.project.id}`}
                  className="text-xs font-mono hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {t.project.code}
                </Link>
              </TableCell>
              <TableCell>
                {t.tags.length === 0 ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <div className="flex flex-wrap items-center gap-1">
                    {t.tags.slice(0, 3).map((tag) => (
                      <TagPill key={tag.id} tag={tag} compact />
                    ))}
                    {t.tags.length > 3 && (
                      <span className="text-[10px] text-muted-foreground">+{t.tags.length - 3}</span>
                    )}
                  </div>
                )}
              </TableCell>
              <TableCell className="text-sm">{t.assignee?.name ?? t.assignee?.email ?? "—"}</TableCell>
              <TableCell><TaskPriorityBadge name={t.priority.name} color={t.priority.color} /></TableCell>
              <TableCell><TaskStageBadge name={stage.name} color={stage.color} /></TableCell>
              <TableCell>
                <ProgressBar
                  value={t.progressPct}
                  caption={
                    t.subtasks.length > 0 && !t.progressManual
                      ? `${t.subtasks.filter((s) => s.completed).length}/${t.subtasks.length}`
                      : undefined
                  }
                  aria-label={`${t.name} progress`}
                />
              </TableCell>
              <TableCell className="text-sm">
                {formatShortDate(t.dueDate)}
              </TableCell>
            </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {openTask && (
        <TaskEditDrawer
          task={openTask}
          open={true}
          onOpenChange={(v) => { if (!v) setOpenTaskId(null); }}
          priorities={priorities}
          kanbanStages={kanbanStages}
          members={members}
          projects={projects}
          allTags={allTags}
        />
      )}
    </>
  );
}
