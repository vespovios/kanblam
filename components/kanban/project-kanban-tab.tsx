import { listTasks } from "@/lib/tasks/service";
import { prisma } from "@/lib/db";
import { KanbanBoard } from "./kanban-board";
import type { TaskRow } from "@/components/tasks/tasks-table";
import type { TagLite } from "@/components/tags/tag-pill";
import type { LaneAxis } from "@/lib/kanban/lanes";

interface Props {
  projectId: string;
  workspaceId: string;
  currentUserId: string;
  allTags: (TagLite & { _count: { tasks: number } })[];
  tagIds: string[];
  lane: LaneAxis;
  /** Mirrors the global "Hide completed" filter — drops terminal-stage tasks. */
  hideCompleted?: boolean;
}

export async function ProjectKanbanTab({ projectId, workspaceId, currentUserId, allTags, tagIds, lane, hideCompleted }: Props) {
  const [rawTasks, priorities, kanbanStages, members, project] =
    await Promise.all([
      listTasks(workspaceId, { projectId, tagIds, hideCompleted }),
      prisma.priority.findMany({ where: { workspaceId }, orderBy: { order: "asc" } }),
      prisma.kanbanStage.findMany({ where: { workspaceId }, orderBy: { order: "asc" } }),
      prisma.user.findMany({
        where: { workspaceId },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
      }),
      prisma.project.findUniqueOrThrow({
        where: { id: projectId },
        select: { id: true, name: true, code: true },
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
    <KanbanBoard
      initialTasks={boardCards}
      fullTasks={fullTasks}
      stages={kanbanStages}
      priorities={priorities}
      kanbanStages={kanbanStages}
      members={members}
      projects={[project]}
      allTags={allTags}
      lane={lane}
      currentUserId={currentUserId}
    />
  );
}
