import { requireUser } from "@/lib/auth/permissions";
import { listTasks } from "@/lib/tasks/service";
import { QUADRANT_IDS, type QuadrantId } from "@/lib/eisenhower/quadrants";
import { prisma } from "@/lib/db";
import { TasksTable } from "@/components/tasks/tasks-table";
import { TaskCreateDialog } from "@/components/tasks/task-create-dialog";
import { TaskSearchInput } from "@/components/tasks/task-search-input";
import { PageRealtimeBridge } from "@/components/realtime/page-realtime-bridge";

interface Props {
  searchParams: Promise<{
    projectId?: string;
    assigneeId?: string;
    hideCompleted?: string;
    quadrant?: string;
    tags?: string;
    q?: string;
  }>;
}

export default async function TasksPage({ searchParams }: Props) {
  const user = await requireUser();
  const { projectId, assigneeId, hideCompleted, quadrant, tags, q } = await searchParams;
  const validatedQuadrant: QuadrantId | undefined =
    quadrant && (QUADRANT_IDS as readonly string[]).includes(quadrant)
      ? (quadrant as QuadrantId)
      : undefined;
  const tagIds = tags ? tags.split(",").filter(Boolean) : [];

  const [rawTasks, projects, priorities, kanbanStages, members, allTags] = await Promise.all([
    listTasks(user.workspaceId, {
      projectId,
      assigneeId,
      hideCompleted: hideCompleted === "true",
      quadrant: validatedQuadrant,
      tagIds,
      q,
    }),
    prisma.project.findMany({
      where: { workspaceId: user.workspaceId },
      select: { id: true, name: true, code: true },
      orderBy: { code: "asc" },
    }),
    prisma.priority.findMany({ where: { workspaceId: user.workspaceId }, orderBy: { order: "asc" } }),
    prisma.kanbanStage.findMany({ where: { workspaceId: user.workspaceId }, orderBy: { order: "asc" } }),
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

  const tasks = rawTasks.map((t) => ({
    ...t,
    startDate: t.startDate ? t.startDate.toISOString() : null,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
  }));

  return (
    <div className="space-y-4">
      <PageRealtimeBridge kinds={["tasks", "tags", "projects", "members"]} />
      <div className="flex items-center justify-between gap-3">
        <TaskSearchInput initial={q ?? ""} />
        <TaskCreateDialog
          projects={projects}
          priorities={priorities}
          kanbanStages={kanbanStages}
          members={members}
          allTags={allTags}
          currentUserId={user.id}
        />
      </div>
      <TasksTable
        tasks={tasks}
        priorities={priorities}
        kanbanStages={kanbanStages}
        members={members}
        projects={projects}
        allTags={allTags}
      />
    </div>
  );
}
