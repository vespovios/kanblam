/** Small colored pill showing a task's kanban stage, for the Tasks table.
 *  Mirrors the stage-badge styling used on DayDash's recent-activity list so
 *  the two surfaces read the same. The badge background is the stage's own
 *  color; text is dark for contrast against the pastel stage palette. */
export function TaskStageBadge({ name, color }: { name: string; color: string }) {
  return (
    <span
      title={name}
      className="inline-block max-w-full w-fit truncate whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium"
      style={{ background: color, color: "#1a1a1a" }}
    >
      {name}
    </span>
  );
}
