import { listTasks } from "@/lib/tasks/service";
import { prisma } from "@/lib/db";
import { EisenhowerBoard } from "./eisenhower-board";
import type { TaskRow } from "@/components/tasks/tasks-table";
import type { TagLite } from "@/components/tags/tag-pill";

interface Props {
  projectId: string;
  workspaceId: string;
  allTags: (TagLite & { _count: { tasks: number } })[];
  tagIds: string[];
  /** Mirrors the global "Hide completed" filter — drops terminal-stage tasks. */
  hideCompleted?: boolean;
}

export async function ProjectEisenhowerTab({ projectId, workspaceId, allTags, tagIds, hideCompleted }: Props) {
  const [rawTasks, priorities, kanbanStages, members, project] =
    await Promise.all([
      listTasks(workspaceId, { projectId, tagIds, hideCompleted }),
      prisma.priority.findMany({ where: { workspaceId }, orderBy: { order: "asc" } }),
      prisma.kanbanStage.findMany({ where: { workspaceId }, orderBy: { order: "asc" } }),
      prisma.user.findMany({
        where: { workspaceId },
        select: { id: true, name: true, email: true, kind: true },
        orderBy: { name: "asc" },
      }),
      prisma.project.findUniqueOrThrow({
        where: { id: projectId },
        select: { id: true, name: true, code: true },
      }),
    ]);

  const initialTasks = rawTasks.map((t) => ({
    id: t.id,
    name: t.name,
    project: { id: t.project.id, code: t.project.code, name: t.project.name },
    assignee: t.assignee
      ? { id: t.assignee.id, name: t.assignee.name, email: t.assignee.email, kind: t.assignee.kind }
      : null,
    priority: { id: t.priority.id, name: t.priority.name, color: t.priority.color },
    tags: t.tags,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    progressPct: t.progressPct,
    subtaskTotal: t.subtasks.length,
    subtaskCompleted: t.subtasks.filter((s) => s.completed).length,
    progressManual: t.progressManual,
    recurringTemplateId: t.recurringTemplateId,
    isImportant: t.isImportant,
    isUrgent: t.isUrgent,
  }));

  const fullTasks: TaskRow[] = rawTasks.map((t) => ({
    ...t,
    startDate: t.startDate ? t.startDate.toISOString() : null,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
  }));

  return (
    <EisenhowerBoard
      initialTasks={initialTasks}
      fullTasks={fullTasks}
      priorities={priorities}
      kanbanStages={kanbanStages}
      members={members}
      projects={[project]}
      allTags={allTags}
    />
  );
}
