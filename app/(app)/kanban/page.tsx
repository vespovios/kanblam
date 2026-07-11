import { requireUser } from "@/lib/auth/permissions";
import { listTasks } from "@/lib/tasks/service";
import { QUADRANT_IDS, type QuadrantId } from "@/lib/eisenhower/quadrants";
import { prisma } from "@/lib/db";
import { KanbanBoard } from "@/components/kanban/kanban-board";
import { LaneToggle } from "@/components/kanban/lane-toggle";
import { PageRealtimeBridge } from "@/components/realtime/page-realtime-bridge";
import type { TaskRow } from "@/components/tasks/tasks-table";
import type { LaneAxis } from "@/lib/kanban/lanes";

interface Props {
  searchParams: Promise<{ projectId?: string; assigneeId?: string; hideCompleted?: string; quadrant?: string; tags?: string; lane?: string }>;
}

function parseLaneAxis(raw: string | undefined): LaneAxis {
  return raw === "assignee" || raw === "tag" || raw === "project" ? raw : "none";
}

export default async function KanbanPage({ searchParams }: Props) {
  const user = await requireUser();
  const { projectId, assigneeId, hideCompleted, quadrant, tags, lane: laneParam } = await searchParams;
  const lane = parseLaneAxis(laneParam);
  const validatedQuadrant: QuadrantId | undefined =
    quadrant && (QUADRANT_IDS as readonly string[]).includes(quadrant)
      ? (quadrant as QuadrantId)
      : undefined;
  const tagIds = tags ? tags.split(",").filter(Boolean) : [];

  const [rawTasks, projects, priorities, kanbanStages, members, allTags] =
    await Promise.all([
      listTasks(user.workspaceId, {
        projectId,
        assigneeId,
        hideCompleted: hideCompleted === "true",
        quadrant: validatedQuadrant,
        tagIds,
      }),
      prisma.project.findMany({
        where: { workspaceId: user.workspaceId },
        select: { id: true, name: true, code: true },
        orderBy: { code: "asc" },
      }),
      prisma.priority.findMany({
        where: { workspaceId: user.workspaceId },
        orderBy: { order: "asc" },
      }),
      prisma.kanbanStage.findMany({
        where: { workspaceId: user.workspaceId },
        orderBy: { order: "asc" },
      }),
      prisma.user.findMany({
        where: { workspaceId: user.workspaceId },
        select: { id: true, name: true, email: true, kind: true },
        orderBy: { name: "asc" },
      }),
      prisma.tag.findMany({
        where: { workspaceId: user.workspaceId },
        include: { _count: { select: { tasks: true } } },
        orderBy: { name: "asc" },
      }),
    ]);

  // Kanban uses kanbanOrder as the source of truth for within-column position.
  const sortedTasks = [...rawTasks].sort((a, b) => a.kanbanOrder - b.kanbanOrder);

  const boardCards = sortedTasks.map((t) => ({
    id: t.id,
    name: t.name,
    project: { id: t.project.id, code: t.project.code, name: t.project.name },
    assignee: t.assignee
      ? { id: t.assignee.id, name: t.assignee.name, email: t.assignee.email }
      : null,
    priority: { id: t.priority.id, name: t.priority.name, color: t.priority.color },
    tags: t.tags,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    isImportant: t.isImportant,
    isUrgent: t.isUrgent,
    progressPct: t.progressPct,
    subtaskTotal: t.subtasks.length,
    subtaskCompleted: t.subtasks.filter((s) => s.completed).length,
    progressManual: t.progressManual,
    recurringTemplateId: t.recurringTemplateId,
    kanbanStageId: t.kanbanStageId,
  }));

  const fullTasks: TaskRow[] = sortedTasks.map((t) => ({
    ...t,
    startDate: t.startDate ? t.startDate.toISOString() : null,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
  }));

  return (
    <div className="space-y-4">
      <PageRealtimeBridge kinds={["tasks", "kanban_stages", "tags"]} />
      <div className="flex items-center justify-end">
        <LaneToggle value={lane} />
      </div>
      {/* Key on filter params so the board remounts with fresh state when filters change. */}
      <KanbanBoard
        key={`${projectId ?? ""}|${assigneeId ?? ""}|${hideCompleted ?? ""}|${validatedQuadrant ?? ""}|${tags ?? ""}|${lane}`}
        initialTasks={boardCards}
        fullTasks={fullTasks}
        stages={kanbanStages}
        priorities={priorities}
        kanbanStages={kanbanStages}
        members={members}
        projects={projects}
        allTags={allTags}
        lane={lane}
        currentUserId={user.id}
      />
    </div>
  );
}
