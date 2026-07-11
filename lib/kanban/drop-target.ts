export interface DropTarget {
  destStageId: string;
  newIndex: number;
}

/**
 * Given a dnd-kit drag-end event's active/over ids plus a current snapshot of
 * which task ids live in which stage (in visual order), compute the destination
 * stage and the index the dragged task should occupy in that stage after the
 * drop.
 *
 * Returns null when the drop is a no-op (over === active, or over unknown).
 *
 * `newIndex` is computed against the destination stage's list with the active
 * task removed — which matches the semantics of `moveTask({ kanbanStageId,
 * newIndex })` on the backend, so the caller can pass it straight through.
 */
export function resolveDropTarget(
  activeId: string,
  overId: string,
  stageIds: readonly string[],
  tasksByStage: Readonly<Record<string, readonly string[]>>,
): DropTarget | null {
  if (activeId === overId) return null;

  // Case A: dropped on column chrome (overId matches a stage id)
  if (stageIds.includes(overId)) {
    const list = tasksByStage[overId] ?? [];
    const filtered = list.filter((id) => id !== activeId);
    return { destStageId: overId, newIndex: filtered.length };
  }

  // Case B: dropped on a card — find its stage and position in the
  // active-removed list.
  for (const stageId of stageIds) {
    const list = tasksByStage[stageId] ?? [];
    if (!list.includes(overId)) continue;
    const filtered = list.filter((id) => id !== activeId);
    const idx = filtered.indexOf(overId);
    return { destStageId: stageId, newIndex: idx === -1 ? 0 : idx };
  }

  return null;
}

/**
 * Returns true when a drop would leave the card in its original slot —
 * i.e. same stage AND the active task's current position equals the
 * target's newIndex (post-removal). Happens specifically when dropping
 * onto the card immediately after the active card, since removing the
 * active shifts that card's post-removal index down to match.
 *
 * Callers short-circuit the move API call on true to avoid a wasted
 * request.
 */
export function isNoOpDrop(
  sourceStageId: string,
  activeId: string,
  target: DropTarget,
  tasksByStage: Readonly<Record<string, readonly string[]>>,
): boolean {
  if (sourceStageId !== target.destStageId) return false;
  const list = tasksByStage[sourceStageId] ?? [];
  return list.indexOf(activeId) === target.newIndex;
}
