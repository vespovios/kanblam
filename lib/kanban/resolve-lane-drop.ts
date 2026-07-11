/**
 * Classifies a kanban drag-drop in lane mode (?lane=assignee | ?lane=tag).
 *
 * - "same-cell": active + over share both stageId and laneId. Within-cell
 *   reorder; the dispatcher should fall through to the column-style
 *   resolveDropTarget path so position-aware reordering still works.
 * - "cross-cell": active and over both have lane data, but the cells differ.
 *   The dispatcher's lane-cell branch handles the cross-lane / cross-stage
 *   semantics (reassignment in assignee mode; rejection toast in tag mode).
 * - "card-only": no lane data on either side (none mode, or a malformed
 *   drop). Fall through to today's column-style path.
 */
export type LaneDropKind = "same-cell" | "cross-cell" | "card-only";

interface LaneSlot {
  stageId?: string;
  laneId?: string;
}

export function resolveLaneDrop(
  active: LaneSlot | undefined,
  over: LaneSlot | undefined,
): LaneDropKind {
  const overHasLane = Boolean(over?.stageId && over?.laneId);
  if (!overHasLane) return "card-only";
  const activeHasLane = Boolean(active?.stageId && active?.laneId);
  if (
    activeHasLane &&
    active!.stageId === over!.stageId &&
    active!.laneId === over!.laneId
  ) {
    return "same-cell";
  }
  return "cross-cell";
}
