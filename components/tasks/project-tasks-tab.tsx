import { listTasks } from "@/lib/tasks/service";
import { prisma } from "@/lib/db";
import { TasksTable, type TaskRow } from "./tasks-table";
import { TaskCreateDialog } from "./task-create-dialog";
import type { TagLite } from "@/components/tags/tag-pill";

interface Props {
  projectId: string;
  workspaceId: string;
  currentUserId: string;
  members: { id: string; name: string | null; email: string }[];
  allTags: (TagLite & { _count: { tasks: number } })[];
  tagIds: string[];
  /** Mirrors the global "Hide completed" filter — drops terminal-stage tasks. */
  hideCompleted?: boolean;
}

export async function ProjectTasksTab({ projectId, workspaceId, currentUserId, members, allTags, tagIds, hideCompleted }: Props) {
  const [rawTasks, project, priorities, kanbanStages] = await Promise.all([
    listTasks(workspaceId, { projectId, tagIds, hideCompleted }),
    prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { id: true, name: true, code: true } }),
    prisma.priority.findMany({ where: { workspaceId }, orderBy: { order: "asc" } }),
    prisma.kanbanStage.findMany({ where: { workspaceId }, orderBy: { order: "asc" } }),
  ]);

  const tasks: TaskRow[] = rawTasks.map((t) => ({
    ...t,
    startDate: t.startDate ? t.startDate.toISOString() : null,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
  }));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <TaskCreateDialog
          projects={[project]}
          priorities={priorities}
          kanbanStages={kanbanStages}
          members={members}
          allTags={allTags}
          currentUserId={currentUserId}
        />
      </div>
      <TasksTable
        tasks={tasks}
        priorities={priorities}
        kanbanStages={kanbanStages}
        members={members}
        projects={[project]}
        allTags={allTags}
      />
    </div>
  );
}
