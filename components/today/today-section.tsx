import { TodayTaskRow } from "./today-task-row";
import type { TodayTaskRow as TaskShape } from "@/lib/tasks/today";
import { cn } from "@/lib/utils";

/** Header accent — the 3px coloured underline on the card header. */
type Accent = "danger" | "warning" | "info";

const ACCENT_BORDER: Record<Accent, string> = {
  danger: "border-destructive",
  warning: "border-amber-500",
  info: "border-primary",
};

interface Props {
  title: string;
  emptyText: string;
  rows: TaskShape[];
  /** Controls the row due-date colouring (see TodayTaskRow). */
  variant: "overdue" | "normal";
  /** Header accent colour for the 3px underline. */
  accent: Accent;
}

/**
 * A DayDash action-list card — Overdue / Due today / Q1. Card chrome
 * matches the kanban column treatment: an uppercase title with a 3px
 * accent-coloured underline and a count chip, over a divided task list.
 */
export function TodaySection({ title, emptyText, rows, variant, accent }: Props) {
  return (
    <section className="rounded-xl bg-card ring-1 ring-foreground/10 overflow-hidden">
      <header
        className={cn(
          "flex items-center justify-between px-3.5 py-2 border-b-[3px]",
          ACCENT_BORDER[accent],
        )}
      >
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/80">
          {title}
        </h2>
        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-background text-muted-foreground border border-border">
          {rows.length}
        </span>
      </header>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground px-3.5 py-3">{emptyText}</p>
      ) : (
        <div className="divide-y divide-border">
          {rows.map((t) => (
            <TodayTaskRow key={t.id} task={t} variant={variant} />
          ))}
        </div>
      )}
    </section>
  );
}
