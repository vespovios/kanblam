import { prisma } from "@/lib/db";
import type {
  CreateSubtaskInput,
  UpdateSubtaskInput,
} from "@/lib/validators/subtask";
import { SUBTASKS_PER_TASK_MAX } from "@/lib/validators/subtask";
import { recomputeTaskProgress } from "./recompute-progress";

async function taskInWorkspace(workspaceId: string, taskId: string): Promise<boolean> {
  const t = await prisma.task.findFirst({
    where: { id: taskId, workspaceId },
    select: { id: true },
  });
  return t !== null;
}

async function subtaskInWorkspace(
  workspaceId: string,
  subtaskId: string,
): Promise<{ id: string; taskId: string } | null> {
  const s = await prisma.subtask.findFirst({
    where: { id: subtaskId, task: { workspaceId } },
    select: { id: true, taskId: true },
  });
  return s;
}

export async function listSubtasks(workspaceId: string, taskId: string) {
  if (!(await taskInWorkspace(workspaceId, taskId))) return null;
  return prisma.subtask.findMany({
    where: { taskId },
    orderBy: { position: "asc" },
  });
}

export async function createSubtask(
  workspaceId: string,
  taskId: string,
  input: CreateSubtaskInput,
) {
  if (!(await taskInWorkspace(workspaceId, taskId))) return null;

  return prisma.$transaction(async (tx) => {
    const count = await tx.subtask.count({ where: { taskId } });
    if (count >= SUBTASKS_PER_TASK_MAX) {
      throw new Error(`Maximum ${SUBTASKS_PER_TASK_MAX} subtasks per task`);
    }
    const created = await tx.subtask.create({
      data: {
        taskId,
        title: input.title,
        position: count,
      },
    });
    // New subtask is uncompleted, so the ratio (completed/total) drops; recompute.
    await recomputeTaskProgress(tx, taskId);
    return created;
  });
}

export async function updateSubtask(
  workspaceId: string,
  subtaskId: string,
  input: UpdateSubtaskInput,
) {
  const sub = await subtaskInWorkspace(workspaceId, subtaskId);
  if (!sub) return null;

  return prisma.$transaction(async (tx) => {
    const data: Record<string, unknown> = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.completed !== undefined) data.completed = input.completed;

    const updated = await tx.subtask.update({
      where: { id: subtaskId },
      data,
    });
    // Only completion changes affect derived progress.
    if (input.completed !== undefined) {
      await recomputeTaskProgress(tx, sub.taskId);
    }
    return updated;
  });
}

export async function deleteSubtask(
  workspaceId: string,
  subtaskId: string,
): Promise<boolean> {
  const sub = await subtaskInWorkspace(workspaceId, subtaskId);
  if (!sub) return false;

  await prisma.$transaction(async (tx) => {
    await tx.subtask.delete({ where: { id: subtaskId } });
    await recomputeTaskProgress(tx, sub.taskId);
  });
  return true;
}

export async function reorderSubtasks(
  workspaceId: string,
  taskId: string,
  orderedIds: string[],
): Promise<boolean> {
  if (!(await taskInWorkspace(workspaceId, taskId))) return false;

  await prisma.$transaction(async (tx) => {
    const existing = await tx.subtask.findMany({
      where: { taskId },
      select: { id: true },
    });
    const existingSet = new Set(existing.map((s) => s.id));
    const incomingSet = new Set(orderedIds);
    if (
      existingSet.size !== incomingSet.size ||
      existing.some((s) => !incomingSet.has(s.id))
    ) {
      throw new Error("Reorder set mismatch — IDs must match the existing subtasks for this task");
    }
    for (let i = 0; i < orderedIds.length; i++) {
      await tx.subtask.update({
        where: { id: orderedIds[i] },
        data: { position: i },
      });
    }
  });

  return true;
}
