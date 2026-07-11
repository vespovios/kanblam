import { cn } from "@/lib/utils";

interface Props {
  /** 0–100 */
  value: number;
  /** "sm" for thin (kanban card), "md" for default (table, drawer). */
  size?: "sm" | "md";
  /** Whether to render the numeric label next to the bar. */
  showLabel?: boolean;
  /** Optional caption rendered to the right of the bar (e.g., "3/5" subtask count).
   *  Replaces the numeric label when both are set, since callers using a caption
   *  almost always want to surface that instead of "60%". */
  caption?: string;
  /** Hide from assistive tech — use when the value is already announced by an adjacent control (e.g., a range slider). */
  "aria-hidden"?: boolean;
  /** Accessible name. Defaults to "Progress". Overrides let callers add context (e.g., "Task progress"). */
  "aria-label"?: string;
  className?: string;
}

/**
 * Small pastel progress bar. Uses oklch foreground color for fill,
 * muted for track, to match the rest of the app's pastel styling.
 */
export function ProgressBar({
  value,
  size = "md",
  showLabel = true,
  caption,
  "aria-hidden": ariaHidden,
  "aria-label": ariaLabel = "Progress",
  className,
}: Props) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const height = size === "sm" ? "h-1" : "h-2";

  return (
    <div className={cn("flex items-center gap-2", className)} aria-hidden={ariaHidden}>
      <div
        className={cn(
          "flex-1 rounded-full bg-muted overflow-hidden",
          height,
        )}
        role={ariaHidden ? undefined : "progressbar"}
        aria-label={ariaHidden ? undefined : ariaLabel}
        aria-valuenow={ariaHidden ? undefined : clamped}
        aria-valuemin={ariaHidden ? undefined : 0}
        aria-valuemax={ariaHidden ? undefined : 100}
      >
        <div
          className="h-full rounded-full bg-primary/70 transition-[width] duration-200"
          style={{ width: `${clamped}%` }}
        />
      </div>
      {caption !== undefined ? (
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
          {caption}
        </span>
      ) : showLabel ? (
        <span className="text-xs text-muted-foreground tabular-nums w-9 text-right">
          {clamped}%
        </span>
      ) : null}
    </div>
  );
}
