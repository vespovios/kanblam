import Link from "next/link";

export interface ProjectProgressRow {
  id: string;
  code: string;
  name: string;
  /** Mean of the project's task progressPct values (0-100). */
  avgProgress: number;
  completedCount: number;
  totalCount: number;
}

/**
 * DayDash project-progress panel — one row per project: code + name, a
 * progress bar (avgProgress), and the "done / total" count. The page
 * sorts these lowest-progress-first so laggards surface at the top.
 * Each row links to the project detail page (breadth → depth drill-in).
 */
export function DashboardProjectProgress({
  projects,
}: {
  projects: ProjectProgressRow[];
}) {
  if (projects.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No projects yet — create one from the Projects page.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {projects.map((p) => (
        <li key={p.id}>
          <Link href={`/projects/${p.id}`} className="block group">
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <span className="text-xs min-w-0 truncate">
                <span className="font-mono font-semibold text-muted-foreground mr-1.5">
                  {p.code}
                </span>
                <span className="group-hover:text-primary transition-colors">
                  {p.name}
                </span>
              </span>
              <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                {p.completedCount}/{p.totalCount} · {p.avgProgress}%
              </span>
            </div>
            <span className="block h-1.5 rounded-full bg-muted overflow-hidden">
              <span
                className="block h-full rounded-full bg-primary"
                style={{ width: `${p.avgProgress}%` }}
              />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
