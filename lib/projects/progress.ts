/**
 * Project-level progress, derived from a project's tasks.
 *
 * KanBlam doesn't store a project `progressPct` column — it would need
 * recompute triggers and could drift. Instead, project progress is
 * computed on read from the project's tasks. At KanBlam's scale a
 * per-project aggregate is cheap.
 *
 * Two figures, two purposes:
 * - `avgProgress` — the mean of the tasks' own `progressPct` values. This
 *   is the headline: it's consistent with the progress signal users
 *   already see and set on every card / in the drawer, and it credits a
 *   90%-done task instead of treating it like an untouched one.
 * - `completedCount` / `totalCount` — concrete grounding ("14 of 32
 *   tasks done"). "Completed" means the task sits in a terminal kanban
 *   stage (`isTerminal`), which is the same definition the rest of the
 *   app uses (only "Completed" is terminal — "Cancelled" is not).
 */

export interface ProjectProgressInput {
  progressPct: number;
  kanbanStage: { isTerminal: boolean };
}

export interface ProjectProgress {
  /** Mean of task `progressPct`, 0-100, rounded. 0 for an empty project. */
  avgProgress: number;
  /** Count of tasks in a terminal kanban stage. */
  completedCount: number;
  /** Total task count. */
  totalCount: number;
}

export function computeProjectProgress(
  tasks: ProjectProgressInput[],
): ProjectProgress {
  const totalCount = tasks.length;
  if (totalCount === 0) {
    return { avgProgress: 0, completedCount: 0, totalCount: 0 };
  }

  let progressSum = 0;
  let completedCount = 0;
  for (const t of tasks) {
    progressSum += t.progressPct;
    if (t.kanbanStage.isTerminal) completedCount++;
  }

  return {
    avgProgress: Math.round(progressSum / totalCount),
    completedCount,
    totalCount,
  };
}
