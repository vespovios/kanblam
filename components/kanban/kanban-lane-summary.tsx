"use client";

import type { BoardCard } from "@/lib/kanban/use-kanban-drag";

interface Props {
  /** Cards in this (stage × lane) cell. */
  tasks: BoardCard[];
}

/**
 * Read-only summary shown in a (stage × lane) cell when its swimlane is
 * collapsed — ECM-Pulse-style. A prominent task count plus a priority-mix
 * breakdown (the KanBlam analogue of ECM Pulse's health-dot breakdown).
 *
 * Empty cells render a faded dashed placeholder so the collapsed row still
 * reads as a grid.
 */
export function KanbanLaneSummary({ tasks }: Props) {
  if (tasks.length === 0) {
    return (
      <div
        aria-hidden="true"
        className="rounded-md border border-dashed border-border min-h-[100px] opacity-40"
      />
    );
  }

  // Group by priority for the colour-dot breakdown. Sorted by count desc
  // so the dominant priority in the cell reads first.
  const byPriority = new Map<string, { color: string; name: string; count: number }>();
  for (const t of tasks) {
    const p = t.priority;
    const existing = byPriority.get(p.id);
    if (existing) existing.count++;
    else byPriority.set(p.id, { color: p.color, name: p.name, count: 1 });
  }
  const priorityRows = [...byPriority.values()].sort((a, b) => b.count - a.count);

  return (
    <div className="rounded-md border border-border bg-card shadow-sm min-h-[100px] p-3 flex flex-col items-center justify-center gap-1 text-center">
      <div className="text-2xl font-semibold leading-none text-primary">
        {tasks.length}
      </div>
      <div className="text-[11px] text-muted-foreground">
        {tasks.length === 1 ? "task" : "tasks"}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 pt-1.5">
        {priorityRows.map((p) => (
          <span
            key={p.name}
            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
            title={`${p.count} ${p.name}`}
          >
            <span
              aria-hidden="true"
              className="inline-block size-2 rounded-full ring-1 ring-black/10"
              style={{ background: p.color }}
            />
            {p.count}
          </span>
        ))}
      </div>
    </div>
  );
}
