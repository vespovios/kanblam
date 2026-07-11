import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { visibleWindow, type CalendarView } from "@/lib/calendar/window";
import { CalendarBoard, type CalendarTask } from "@/components/calendar/calendar-board";
import { PageRealtimeBridge } from "@/components/realtime/page-realtime-bridge";

interface Props {
  searchParams: Promise<{
    view?: string;
    date?: string;
    /** Global filter params — written by <GlobalFilters> in the topbar. */
    projectId?: string;
    assigneeId?: string;
    hideCompleted?: string;
    tags?: string;
  }>;
}

function parseView(s: string | undefined): CalendarView {
  return s === "week" ? "week" : "month";
}

function parseDate(s: string | undefined): Date {
  const today = new Date();
  const fallback = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  if (!s) return fallback;
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(s);
  if (!m) return fallback;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10) - 1;
  const day = parseInt(m[3] ?? "1", 10);
  return new Date(Date.UTC(year, month, day));
}

function addOneDay(d: Date): Date {
  return new Date(d.getTime() + 24 * 60 * 60 * 1000);
}

export default async function CalendarPage({ searchParams }: Props) {
  const user = await requireUser();
  const params = await searchParams;
  const view = parseView(params.view);
  const referenceDate = parseDate(params.date);
  const hideCompleted = params.hideCompleted === "true";
  const tagIds = params.tags ? params.tags.split(",").filter(Boolean) : [];

  const win = visibleWindow(view, referenceDate);

  // Build the task filter.
  // dueDate / startDate use gte/lt (not lte) to include the entire last day
  // even when the column carries time-of-day (DateTime, not @db.Date).
  // The OR covers the three classes of tasks visible in the window. Both-set
  // tasks where dueDate is in window but startDate isn't are still caught by
  // #1 (range-overlap), since the validator guarantees startDate <= dueDate.
  //   1. Multi-day: range overlaps the window (both startDate and dueDate set).
  //   2. Start-only open-ended: startDate in window, no dueDate.
  //   3. Due-only single pill: dueDate in window, no startDate.
  const winFromUtc = win.from;
  const winToExclusive = addOneDay(win.to);

  const taskWhere: Prisma.TaskWhereInput = {
    workspaceId: user.workspaceId,
    OR: [
      { startDate: { lt: winToExclusive }, dueDate: { gte: winFromUtc } },
      { startDate: { gte: winFromUtc, lt: winToExclusive }, dueDate: null },
      { dueDate: { gte: winFromUtc, lt: winToExclusive }, startDate: null },
    ],
  };
  if (params.projectId) taskWhere.projectId = params.projectId;
  if (params.assigneeId) taskWhere.assigneeId = params.assigneeId;
  if (tagIds.length > 0) {
    taskWhere.tags = { some: { id: { in: tagIds } } };
  }
  if (hideCompleted) {
    taskWhere.kanbanStage = { isTerminal: false };
  }

  const [rawTasks, holidays, workspace, projects, members, priorities, kanbanStages, allTags] =
    await Promise.all([
      prisma.task.findMany({
        where: taskWhere,
        include: {
          project: { select: { id: true, name: true, code: true } },
          priority: { select: { id: true, name: true, color: true, order: true } },
          assignee: { select: { id: true, name: true, email: true, kind: true } },
          kanbanStage: { select: { id: true, name: true, color: true, isTerminal: true } },
          tags: { select: { id: true, name: true, color: true } },
          subtasks: {
            select: { id: true, title: true, completed: true, position: true },
            orderBy: { position: "asc" },
          },
        },
      }),
      prisma.holiday.findMany({
        where: { workspaceId: user.workspaceId, date: { gte: win.from, lte: win.to } },
        orderBy: { date: "asc" },
      }),
      prisma.workspace.findUniqueOrThrow({
        where: { id: user.workspaceId },
        select: { workingDays: true },
      }),
      prisma.project.findMany({
        where: { workspaceId: user.workspaceId },
        select: { id: true, name: true, code: true },
        orderBy: { code: "asc" },
      }),
      prisma.user.findMany({
        where: { workspaceId: user.workspaceId },
        select: { id: true, name: true, email: true, kind: true },
        orderBy: { name: "asc" },
      }),
      prisma.priority.findMany({
        where: { workspaceId: user.workspaceId },
        select: { id: true, name: true, order: true },
        orderBy: { order: "asc" },
      }),
      prisma.kanbanStage.findMany({
        where: { workspaceId: user.workspaceId },
        select: { id: true, name: true },
        orderBy: { order: "asc" },
      }),
      prisma.tag.findMany({
        where: { workspaceId: user.workspaceId },
        include: { _count: { select: { tasks: true } } },
        orderBy: { name: "asc" },
      }),
    ]);

  const tasks: CalendarTask[] = rawTasks.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description ?? null,
    project: t.project,
    assignee: t.assignee,
    priority: t.priority,
    kanbanStage: t.kanbanStage,
    tags: t.tags,
    subtasks: t.subtasks,
    progressManual: t.progressManual,
    startDate: t.startDate ? t.startDate.toISOString() : null,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    progressPct: t.progressPct,
    recurringTemplateId: t.recurringTemplateId,
    isImportant: t.isImportant,
    isUrgent: t.isUrgent,
  }));

  const serializedHolidays = holidays.map((h) => ({
    id: h.id,
    name: h.name,
    date: h.date.toISOString().slice(0, 10),
  }));

  return (
    <div className="space-y-4">
      <PageRealtimeBridge kinds={["tasks", "holidays", "working_days"]} />
      {/* Key on view + period + filters so the board remounts with fresh state when any of them change. */}
      <CalendarBoard
        key={`${view}|${referenceDate.toISOString().slice(0, 10)}|${params.projectId ?? ""}|${params.assigneeId ?? ""}|${hideCompleted}|${params.tags ?? ""}`}
        view={view}
        referenceDateIso={referenceDate.toISOString().slice(0, 10)}
        tasks={tasks}
        holidays={serializedHolidays}
        workingDays={workspace.workingDays}
        projects={projects}
        members={members}
        priorities={priorities}
        kanbanStages={kanbanStages}
        allTags={allTags}
        currentUserId={user.id}
        filterProjectId={params.projectId ?? null}
      />
    </div>
  );
}
