/**
 * Stage classification for list views — turns a kanban stage into a single
 * "is this task open / done / cancelled?" answer, and picks the target stage
 * for the list checkbox's complete / reopen toggle.
 *
 * Two distinct concepts the UI must keep separate (a beta-tester confusion):
 *   - **Stage** = the task's lifecycle state. Whether it's *done* is decided by
 *     `KanbanStage.isTerminal` — the same definition the rest of the app uses
 *     (`listTasks` "hide completed", project progress). Only "Completed" is
 *     terminal; "Cancelled" deliberately is not (a cancelled task isn't
 *     "completed work").
 *   - **Progress %** = how much of the work inside the task is finished. Fully
 *     decoupled — 100% progress does NOT complete a task, and completing a task
 *     does NOT touch its progress.
 *
 * ⚠️ "Cancelled" is identified by name because the data model has no
 * `isCancelled` flag — only `isTerminal`. Stage names are fixed, designed seed
 * data (not user-renamable), so a name match is safe today. If stages ever
 * become user-editable, replace this with a real flag / stage-kind enum.
 */

/** The seeded name for the cancelled stage. */
export const CANCELLED_STAGE_NAME = "Cancelled";

/** Minimal stage shape these helpers need. */
export interface StageLike {
  id: string;
  name: string;
  isTerminal: boolean;
  /** Sort order within the board; lower = earlier. */
  order: number;
}

export type StageKind = "active" | "done" | "cancelled";

/** A done task sits in a terminal stage (today: "Completed"). */
export function isDoneStage(stage: { isTerminal: boolean }): boolean {
  return stage.isTerminal === true;
}

/** A cancelled task sits in the "Cancelled" stage (non-terminal by design). */
export function isCancelledStage(stage: { name: string; isTerminal: boolean }): boolean {
  return !stage.isTerminal && stage.name === CANCELLED_STAGE_NAME;
}

/** Classify a stage into the three list-view states. */
export function stageKind(stage: { name: string; isTerminal: boolean }): StageKind {
  if (isDoneStage(stage)) return "done";
  if (isCancelledStage(stage)) return "cancelled";
  return "active";
}

/**
 * The stage the checkbox moves a task INTO when marking it complete: the
 * earliest terminal stage by order. `null` if the board has no terminal stage.
 */
export function findCompleteTarget<T extends StageLike>(stages: readonly T[]): T | null {
  return [...stages].sort((a, b) => a.order - b.order).find((s) => s.isTerminal) ?? null;
}

/**
 * The stage the checkbox moves a task INTO when reopening a done/cancelled
 * task: the earliest stage that is neither terminal nor cancelled (i.e. the
 * first genuinely active stage — "Ideas" in the default board). Matches the
 * "active stage" convention used by the Asana importer. `null` if none exists.
 */
export function findReopenTarget<T extends StageLike>(stages: readonly T[]): T | null {
  return (
    [...stages]
      .sort((a, b) => a.order - b.order)
      .find((s) => !s.isTerminal && !isCancelledStage(s)) ?? null
  );
}
