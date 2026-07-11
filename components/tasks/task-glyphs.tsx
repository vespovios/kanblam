import { CirclePause, Repeat } from "lucide-react";

interface Props {
  isImportant: boolean;
  isUrgent: boolean;
  recurringTemplateId: string | null;
  /** "card" (default) — used inside a vertical card body (kanban / eisenhower).
   *  Each glyph is a flex child sized via the parent's `gap`.
   *  "inline" — used inline before a task name (e.g. tasks-table cell).
   *  Each glyph carries its own `mr-1` for spacing. */
  variant?: "card" | "inline";
}

/**
 * The four-slot task-state glyph row: ★ (important), ⏱ (urgent),
 * ↻ (recurring), ⏸ (eliminate — Q4: !important && !urgent). Used across
 * KanbanCard, EisenhowerCard, and the TasksTable row. Single source of
 * truth so the palette can't drift between surfaces.
 */
export function TaskGlyphs({ isImportant, isUrgent, recurringTemplateId, variant = "card" }: Props) {
  if (variant === "inline") {
    return (
      <>
        {isImportant && <span className="mr-1 text-amber-600">★</span>}
        {isUrgent && <span className="mr-1 text-rose-600">⏱</span>}
        {recurringTemplateId && (
          <Repeat className="inline mr-1 size-3 text-muted-foreground" aria-label="Recurring task" />
        )}
        {!isImportant && !isUrgent && (
          <CirclePause className="inline mr-1 size-3 text-slate-600" aria-label="Eliminate" />
        )}
      </>
    );
  }
  return (
    <>
      {isImportant && <span className="text-amber-600 text-xs">★</span>}
      {isUrgent && <span className="text-rose-600 text-xs">⏱</span>}
      {recurringTemplateId && (
        <Repeat className="size-3 text-muted-foreground mt-0.5" aria-label="Recurring task" />
      )}
      {!isImportant && !isUrgent && (
        <CirclePause className="size-3 text-slate-600 mt-0.5" aria-label="Eliminate" />
      )}
    </>
  );
}
