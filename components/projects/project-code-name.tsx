import { cn } from "@/lib/utils";

interface Props {
  code: string;
  name: string;
  /** Outer wrapper className. */
  className?: string;
  /** Extra classes for the code span (default is font-mono + muted). */
  codeClassName?: string;
  /** Separator glyph between code and name. Default '·' (middle dot)
   *  reads light inline; pass '—' for page headings where the em-dash
   *  carries more visual weight. */
  separator?: "·" | "—";
}

/** Render "P01 · Finish KanBlam site" (or "P01 — Finish KanBlam site") with
 *  **real text-node spaces**, not CSS margins. Hermes' QA flagged the
 *  project-detail heading reading as "P01—Finish KanBlam site" with no
 *  whitespace — that was visually-spaced via `mr-2` but the DOM
 *  textContent contained zero spaces, so screen readers, copy-paste,
 *  page-title scrapes etc all got the mashed version. This component
 *  uses explicit `{" "}` so the spaces survive everywhere. */
export function ProjectCodeName({
  code,
  name,
  className,
  codeClassName,
  separator = "·",
}: Props) {
  return (
    <span className={className}>
      <span className={cn("font-mono text-muted-foreground", codeClassName)}>{code}</span>
      {" "}{separator}{" "}
      {name}
    </span>
  );
}
