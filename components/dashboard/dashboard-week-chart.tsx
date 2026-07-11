"use client";

import {
  BarChart,
  Bar,
  XAxis,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export interface WeekDayDatum {
  /** Short weekday label, e.g. "Mon". */
  label: string;
  /** Tasks due on this day. */
  count: number;
  /** Whether this is today — highlighted in the brand accent. */
  isToday: boolean;
}

/**
 * 7-day "due this week" bar chart for the DayDash "Shape of the work"
 * section. Today's bar is the brand accent; the rest are muted. A small
 * themed tooltip surfaces exact counts. Animation off so realtime-sync
 * refreshes don't flicker.
 */
export function DashboardWeekChart({ days }: { days: WeekDayDatum[] }) {
  return (
    <div className="h-[124px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={days} margin={{ top: 6, right: 0, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            contentStyle={{
              background: "var(--popover)",
              border: "0.5px solid var(--border)",
              borderRadius: "8px",
              fontSize: "12px",
              color: "var(--popover-foreground)",
              padding: "4px 8px",
            }}
            labelStyle={{ color: "var(--foreground)", fontWeight: 500 }}
            formatter={(value: number) => [
              `${value} task${value === 1 ? "" : "s"}`,
              "Due",
            ]}
          />
          <Bar dataKey="count" radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {days.map((d) => (
              <Cell
                key={d.label}
                fill={d.isToday ? "var(--primary)" : "var(--muted-foreground)"}
                fillOpacity={d.isToday ? 1 : 0.35}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
