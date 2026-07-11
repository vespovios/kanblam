import type { Prisma } from "@prisma/client";

/**
 * Re-derive `Task.progressPct` from the task's subtask completion ratio,
 * inside the caller's transaction. No-op when:
 *   - the task does not exist, OR
 *   - the task has 0 subtasks, OR
 *   - the task is in manual progress mode (`progressManual = true`).
 *
 * Callers must pass a transaction client so the count + update happen
 * atomically with whatever subtask write triggered the recompute.
 */
export async function recomputeTaskProgress(
  tx: Prisma.TransactionClient,
  taskId: string,
): Promise<void> {
  const task = await tx.task.findUnique({
    where: { id: taskId },
    select: { progressManual: true },
  });
  if (!task) return;
  if (task.progressManual) return;

  const total = await tx.subtask.count({ where: { taskId } });
  if (total === 0) return;

  const completed = await tx.subtask.count({ where: { taskId, completed: true } });
  const pct = Math.round((completed / total) * 100);

  await tx.task.update({
    where: { id: taskId },
    data: { progressPct: pct },
  });
}
