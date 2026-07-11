import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { CreateTaskInput, UpdateTaskInput } from "@/lib/validators/task";
import { quadrantFlags, type QuadrantId } from "@/lib/eisenhower/quadrants";
import { assertTagsInWorkspace } from "@/lib/tags/service";
import { recomputeTaskProgress } from "@/lib/subtasks/recompute-progress";

export const TASK_INCLUDE = {
  priority: true,
  kanbanStage: true,
  project: { select: { id: true, name: true, code: true } },
  assignee: { select: { id: true, name: true, email: true, kind: true } },
  tags: { select: { id: true, name: true, color: true } },
  subtasks: {
    select: { id: true, title: true, completed: true, position: true },
    orderBy: { position: "asc" } as const,
  },
} as const;

function toDate(v?: string | null): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  return new Date(v);
}

async function projectInWorkspace(workspaceId: string, projectId: string): Promise<boolean> {
  const c = await prisma.project.count({ where: { id: projectId, workspaceId } });
  return c > 0;
}

async function assigneeInWorkspace(workspaceId: string, userId: string): Promise<boolean> {
  const c = await prisma.user.count({ where: { id: userId, workspaceId } });
  return c > 0;
}

export async function createTask(workspaceId: string, input: CreateTaskInput) {
  if (!(await projectInWorkspace(workspaceId, input.projectId))) return null;
  if (input.assigneeId && !(await assigneeInWorkspace(workspaceId, input.assigneeId))) {
    return null;
  }

  if (input.tagIds && input.tagIds.length > 0) {
    await assertTagsInWorkspace(workspaceId, input.tagIds);
  }

  const last = await prisma.task.findFirst({
    where: { workspaceId, kanbanStageId: input.kanbanStageId },
    orderBy: { kanbanOrder: "desc" },
    select: { kanbanOrder: true },
  });

  const result = await prisma.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        workspaceId,
        projectId: input.projectId,
        name: input.name,
        description: input.description,
        isImportant: input.isImportant ?? false,
        isUrgent: input.isUrgent ?? false,
        priorityId: input.priorityId,
        kanbanStageId: input.kanbanStageId,
        assigneeId: input.assigneeId,
        startDate: toDate(input.startDate) ?? undefined,
        dueDate: toDate(input.dueDate) ?? undefined,
        progressPct: input.progressPct ?? 0,
        kanbanOrder: (last?.kanbanOrder ?? 0) + 1,
        notes: input.notes,
        tags: input.tagIds && input.tagIds.length > 0
          ? { connect: input.tagIds.map((id) => ({ id })) }
          : undefined,
      },
    });

    if (input.subtasks && input.subtasks.length > 0) {
      await tx.subtask.createMany({
        data: input.subtasks.map((s, i) => ({
          taskId: task.id,
          title: s.title,
          position: i,
        })),
      });
    }

    return tx.task.findUnique({
      where: { id: task.id },
      include: TASK_INCLUDE,
    });
  });

  return result;
}

export interface ListTaskFilters {
  projectId?: string;
  assigneeId?: string;
  /** Filter to a single kanban stage (used by the public API). */
  stageId?: string;
  hideCompleted?: boolean;
  quadrant?: QuadrantId;
  tagIds?: string[];
  /** Free-text search across task name + description (case-insensitive substring). */
  q?: string;
}

function buildListWhere(workspaceId: string, filters: ListTaskFilters): Prisma.TaskWhereInput {
  const where: Prisma.TaskWhereInput = { workspaceId };
  if (filters.projectId) where.projectId = filters.projectId;
  if (filters.assigneeId) where.assigneeId = filters.assigneeId;
  if (filters.stageId) where.kanbanStageId = filters.stageId;
  if (filters.quadrant) {
    const { isImportant, isUrgent } = quadrantFlags(filters.quadrant);
    where.isImportant = isImportant;
    where.isUrgent = isUrgent;
  }
  if (filters.tagIds && filters.tagIds.length > 0) {
    where.tags = { some: { id: { in: filters.tagIds } } };
  }
  if (filters.hideCompleted) {
    where.kanbanStage = { isTerminal: false };
  }
  if (filters.q && filters.q.trim() !== "") {
    const q = filters.q.trim();
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }
  return where;
}

export async function listTasks(workspaceId: string, filters: ListTaskFilters) {
  return prisma.task.findMany({
    where: buildListWhere(workspaceId, filters),
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    include: TASK_INCLUDE,
  });
}

/** Cursor-paginated listing for the public API. Stable ordering
 *  (createdAt desc, id desc — id tiebreak makes the cursor deterministic);
 *  `nextCursor` is the last row's id, null when the page wasn't full. */
export async function listTasksPage(
  workspaceId: string,
  filters: ListTaskFilters,
  page: { cursor?: string; limit: number },
) {
  const rows = await prisma.task.findMany({
    where: buildListWhere(workspaceId, filters),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: page.limit + 1,
    ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
    include: TASK_INCLUDE,
  });
  const hasMore = rows.length > page.limit;
  const tasks = hasMore ? rows.slice(0, page.limit) : rows;
  return { tasks, nextCursor: hasMore ? tasks[tasks.length - 1].id : null };
}

export async function getTask(workspaceId: string, id: string) {
  return prisma.task.findFirst({
    where: { id, workspaceId },
    include: TASK_INCLUDE,
  });
}

export async function updateTask(workspaceId: string, id: string, input: UpdateTaskInput) {
  const existing = await prisma.task.findFirst({ where: { id, workspaceId }, select: { id: true } });
  if (!existing) return null;

  // Validate explicit assigneeId against workspace membership (null clears, undefined skips).
  if (input.assigneeId && !(await assigneeInWorkspace(workspaceId, input.assigneeId))) {
    return null;
  }

  // A project move only needs the projectId swapped: kanban stage, priority,
  // tags and assignee are all workspace-scoped (not project-scoped), so they
  // stay valid. kanbanOrder is sequenced per (workspace, stage) across all
  // projects, so it also survives the move untouched. Just confirm the target
  // project belongs to the same workspace — never let a task cross tenants.
  if (input.projectId !== undefined && !(await projectInWorkspace(workspaceId, input.projectId))) {
    return null;
  }

  const data: Record<string, unknown> = {};
  for (const key of [
    "projectId",
    "name",
    "description",
    "isImportant",
    "isUrgent",
    "priorityId",
    "kanbanStageId",
    "assigneeId",
    "progressPct",
    "progressManual",
    "notes",
  ] as const) {
    if (input[key] !== undefined) data[key] = input[key];
  }
  // tagIds replaces (sets) the entire tag set on the task.
  if (input.tagIds !== undefined) {
    if (input.tagIds.length > 0) {
      await assertTagsInWorkspace(workspaceId, input.tagIds);
    }
    data.tags = { set: input.tagIds.map((id) => ({ id })) };
  }
  if (input.startDate !== undefined) data.startDate = toDate(input.startDate);
  if (input.dueDate !== undefined) data.dueDate = toDate(input.dueDate);

  const updated = await prisma.$transaction(async (tx) => {
    // Detect a manual->auto transition inside the tx so the read sees the
    // actual pre-update state inside the same lock window.
    let recomputeAfter = false;
    if (input.progressManual === false) {
      const current = await tx.task.findUnique({
        where: { id },
        select: { progressManual: true },
      });
      recomputeAfter = current?.progressManual === true;
    }

    const u = await tx.task.update({
      where: { id },
      data,
      include: TASK_INCLUDE,
    });
    if (recomputeAfter) {
      await recomputeTaskProgress(tx, id);
      // Re-read to capture the freshly recomputed progressPct.
      return tx.task.findUnique({
        where: { id },
        include: TASK_INCLUDE,
      });
    }
    return u;
  });

  return updated;
}

export async function deleteTask(workspaceId: string, id: string): Promise<boolean> {
  const res = await prisma.task.deleteMany({ where: { id, workspaceId } });
  return res.count > 0;
}

import type { MoveTaskInput } from "@/lib/validators/task-move";

export async function moveTask(
  workspaceId: string,
  taskId: string,
  input: MoveTaskInput,
) {
  const result = await prisma.$transaction(async (tx) => {
    const task = await tx.task.findFirst({
      where: { id: taskId, workspaceId },
      select: { id: true, kanbanStageId: true },
    });
    if (!task) return null;

    const destStage = await tx.kanbanStage.findFirst({
      where: { id: input.kanbanStageId, workspaceId },
      select: { id: true },
    });
    if (!destStage) return null;

    // Validate optional assigneeId against workspace membership.
    if (input.assigneeId !== undefined) {
      const member = await tx.user.findFirst({
        where: { id: input.assigneeId, workspaceId },
        select: { id: true },
      });
      if (!member) return null;
    }

    const destTasks = await tx.task.findMany({
      where: {
        workspaceId,
        kanbanStageId: input.kanbanStageId,
        NOT: { id: taskId },
      },
      orderBy: { kanbanOrder: "asc" },
      select: { id: true },
    });

    const newOrder = [...destTasks.map((t) => t.id)];
    const targetIndex =
      input.newIndex === undefined
        ? newOrder.length
        : Math.max(0, Math.min(input.newIndex, newOrder.length));
    newOrder.splice(targetIndex, 0, taskId);

    const stageChanged = task.kanbanStageId !== input.kanbanStageId;
    if (stageChanged || input.assigneeId !== undefined) {
      await tx.task.update({
        where: { id: taskId },
        data: {
          ...(stageChanged ? { kanbanStageId: input.kanbanStageId } : {}),
          ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
        },
      });
    }

    for (let i = 0; i < newOrder.length; i++) {
      await tx.task.update({
        where: { id: newOrder[i] },
        data: { kanbanOrder: i + 1 },
      });
    }

    return tx.task.findUnique({
      where: { id: taskId },
      include: TASK_INCLUDE,
    });
  });

  return result;
}
