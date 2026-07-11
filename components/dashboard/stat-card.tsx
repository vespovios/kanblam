import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Semantic tone for the icon chip — maps to a tinted background + icon colour. */
export type StatTone = "danger" | "warning" | "info" | "success";

const TONE: Record<StatTone, string> = {
  danger: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  warning: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  info: "bg-secondary text-primary",
  success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
};

interface Props {
  icon: LucideIcon;
  label: string;
  value: string | number;
  tone: StatTone;
}

/**
 * A single DayDash "pulse" metric: a tinted icon chip + label + value.
 * Used in a 4-up grid at the top of the dashboard.
 */
export function StatCard({ icon: Icon, label, value, tone }: Props) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-card ring-1 ring-foreground/10 px-3.5 py-3">
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg",
          TONE[tone],
        )}
      >
        <Icon className="size-[18px]" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] text-muted-foreground truncate">
          {label}
        </span>
        <span className="block text-xl font-semibold leading-tight">{value}</span>
      </span>
    </div>
  );
}
