export interface PriorityDatum {
  name: string;
  color: string;
  count: number;
}

/**
 * Tasks-by-priority horizontal bars for the DayDash "Shape of the work"
 * section. Plain CSS — no charting library — which is calmer and lighter
 * than a Recharts bar chart for this many fixed categories. Bars are
 * scaled to the busiest priority so the relative load reads at a glance.
 */
export function DashboardPriorityBars({
  priorities,
}: {
  priorities: PriorityDatum[];
}) {
  const max = Math.max(1, ...priorities.map((p) => p.count));

  return (
    <div className="flex flex-col gap-2 text-xs">
      {priorities.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-[68px] shrink-0 text-muted-foreground truncate">
            {p.name}
          </span>
          <span className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
            <span
              className="block h-full rounded-full"
              style={{
                width: `${(p.count / max) * 100}%`,
                background: p.color,
              }}
            />
          </span>
          <span className="w-6 text-right tabular-nums font-medium">
            {p.count}
          </span>
        </div>
      ))}
    </div>
  );
}
