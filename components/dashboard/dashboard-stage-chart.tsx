"use client";

import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

export interface StageDatum {
  name: string;
  color: string;
  count: number;
}

/**
 * Tasks-by-stage donut for the DayDash "Shape of the work" section.
 * Slices are coloured by the kanban stage's own colour; a custom legend
 * sits beside it (Recharts' built-in legend is hard to theme cleanly).
 * Animation is off so realtime-sync refreshes don't flicker.
 */
export function DashboardStageChart({ stages }: { stages: StageDatum[] }) {
  const total = stages.reduce((sum, s) => sum + s.count, 0);
  const slices = stages.filter((s) => s.count > 0);

  return (
    <div className="flex items-center gap-4">
      <div className="relative size-[116px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="count"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={34}
              outerRadius={56}
              paddingAngle={slices.length > 1 ? 1.5 : 0}
              stroke="var(--card)"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {slices.map((s) => (
                <Cell key={s.name} fill={s.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-lg font-semibold leading-none">{total}</span>
          <span className="text-[10px] text-muted-foreground">tasks</span>
        </div>
      </div>
      <ul className="flex flex-col gap-1 text-xs min-w-0 flex-1">
        {stages.map((s) => (
          <li key={s.name} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-2 rounded-sm shrink-0"
              style={{ background: s.color }}
            />
            <span className="text-muted-foreground truncate">{s.name}</span>
            <span className="ml-auto font-medium tabular-nums">{s.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
