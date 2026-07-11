import Link from "next/link";

export interface RecentActivityRow {
  id: string;
  name: string;
  projectCode: string;
  /** Assignee initials, or null if unassigned. */
  assigneeInitials: string | null;
  stageName: string;
  stageColor: string;
  /** ISO timestamp of the task's last update. */
  updatedAt: string;
}

/** Compact relative-time label for the "Updated" column. */
function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.round(days / 7)}w ago`;
}

/**
 * DayDash recent-activity list — most recently updated tasks, newest first.
 * Each row is a single <Link> styled as a table row via CSS grid. The
 * earlier version was a real <table> with a stretched-link `::before`
 * overlay on the first cell, which depended on `position: relative` working
 * on <tr> — that's flaky in Firefox (table layout doesn't reliably create
 * a positioning context). Per Hermes' QA, only the first column was
 * clickable.
 *
 * The grid-of-Links approach clicks everywhere natively (whole row is one
 * <a>), tabs/Enter work, right-click → "open in new tab" works, and
 * there's no positioning gymnastics to debug.
 *
 * Server component: `timeAgo` resolves at request time, fine for a
 * dashboard (the cron / SSE doesn't re-render this without a server round
 * trip, so render-time computation matches what the user reads).
 */
export function DashboardRecentActivity({
  rows,
}: {
  rows: RecentActivityRow[];
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground px-4 py-3">
        No task activity yet.
      </p>
    );
  }

  // Column template: Task name takes remaining space; every sibling column is
  // a FIXED width so the independent per-row grids share identical tracks and
  // line up. The Stage column was previously `auto`, which sized to each row's
  // own badge — so a wide "Completed" badge pushed that row's "Updated" out of
  // alignment with "Ideas" rows. Fixed widths fit the longest realistic values
  // ("In Progress" stage; multi-char project codes); anything longer truncates
  // rather than widening the track. `hidden sm:block` columns only show on >=sm.
  const GRID = "grid items-center gap-x-3 px-4 py-2 grid-cols-[minmax(0,1fr)_6.5rem] sm:grid-cols-[minmax(0,1fr)_6rem_3rem_6.5rem_5rem]";

  return (
    <div role="list" aria-label="Recent task activity">
      {/* Header row — not interactive, mirrors the column labels. */}
      <div
        aria-hidden="true"
        className={`${GRID} text-xs font-medium text-muted-foreground`}
      >
        <div>Task</div>
        <div className="hidden sm:block">Project</div>
        <div className="hidden sm:block">Assignee</div>
        <div>Stage</div>
        <div className="hidden sm:block text-right">Updated</div>
      </div>

      {rows.map((r) => (
        <Link
          key={r.id}
          href={`/tasks?taskId=${r.id}`}
          role="listitem"
          aria-label={`Open task ${r.name}`}
          className={`${GRID} text-xs border-t border-border hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
        >
          <span title={r.name} className="truncate hover:text-primary transition-colors">
            {r.name}
          </span>
          <span title={r.projectCode} className="hidden sm:block font-mono text-muted-foreground truncate">
            {r.projectCode}
          </span>
          <span className="hidden sm:block text-muted-foreground">
            {r.assigneeInitials ?? "—"}
          </span>
          <span
            title={r.stageName}
            className="inline-block max-w-full w-fit truncate whitespace-nowrap px-1.5 py-0.5 rounded text-[10px] font-medium"
            style={{ background: r.stageColor, color: "#1a1a1a" }}
          >
            {r.stageName}
          </span>
          <span className="hidden sm:block text-right text-muted-foreground whitespace-nowrap">
            {timeAgo(r.updatedAt)}
          </span>
        </Link>
      ))}
    </div>
  );
}
