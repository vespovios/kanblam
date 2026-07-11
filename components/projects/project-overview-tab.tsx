import {
  computeProjectProgress,
  type ProjectProgressInput,
} from "@/lib/projects/progress";
import { DashboardStageChart } from "@/components/dashboard/dashboard-stage-chart";
import { Badge } from "@/components/ui/badge";
import { formatShortDate } from "@/lib/dates/format";

interface OverviewTask extends ProjectProgressInput {
  kanbanStage: {
    id: string;
    name: string;
    color: string;
    order: number;
    isTerminal: boolean;
  };
  assignee: { id: string; name: string | null; email: string; kind: "HUMAN" | "AGENT" } | null;
}

interface Props {
  tasks: OverviewTask[];
  startDate: Date | null;
  endDate: Date | null;
  createdAt: Date;
}

// Thin alias kept for readability at call sites; routes through the central
// formatter so US-style M/D/YYYY ambiguity doesn't sneak back in (qa#11).
function fmtDate(d: Date | null): string {
  return formatShortDate(d);
}

/**
 * Project detail → Overview tab. The "depth" half of the dashboard ↔
 * project-page split: DayDash shows one progress number per project,
 * this page shows the full anatomy of a single project — the headline
 * progress, where its tasks sit in the pipeline, and who's carrying them.
 *
 * Uses the same `computeProjectProgress` helper as DayDash so the headline
 * figure is identical to the project's row on the dashboard.
 */
export function ProjectOverviewTab({ tasks, startDate, endDate, createdAt }: Props) {
  const progress = computeProjectProgress(tasks);

  // Tasks by stage — dedup by stage id, ordered by the stage's own order.
  const stageMap = new Map<
    string,
    { name: string; color: string; order: number; count: number }
  >();
  for (const t of tasks) {
    const s = t.kanbanStage;
    const existing = stageMap.get(s.id);
    if (existing) existing.count++;
    else stageMap.set(s.id, { name: s.name, color: s.color, order: s.order, count: 1 });
  }
  const stages = [...stageMap.values()].sort((a, b) => a.order - b.order);

  // Tasks by assignee — busiest first, an "Unassigned" bucket last.
  const assigneeMap = new Map<string, { name: string; isAgent: boolean; count: number }>();
  let unassigned = 0;
  for (const t of tasks) {
    if (!t.assignee) {
      unassigned++;
      continue;
    }
    const existing = assigneeMap.get(t.assignee.id);
    if (existing) existing.count++;
    else
      assigneeMap.set(t.assignee.id, {
        name: t.assignee.name ?? t.assignee.email,
        isAgent: t.assignee.kind === "AGENT",
        count: 1,
      });
  }
  const assignees = [...assigneeMap.values()].sort((a, b) => b.count - a.count);
  if (unassigned > 0) assignees.push({ name: "Unassigned", isAgent: false, count: unassigned });
  const maxAssignee = Math.max(1, ...assignees.map((a) => a.count));

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Headline progress */}
      <div className="rounded-xl bg-card ring-1 ring-foreground/10 p-4">
        <div className="flex items-baseline justify-between gap-3 mb-2">
          <h3 className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
            Project progress
          </h3>
          <span className="text-sm text-muted-foreground tabular-nums">
            {progress.completedCount} of {progress.totalCount} tasks done
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-3xl font-semibold tabular-nums leading-none">
            {progress.avgProgress}%
          </span>
          <span className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
            <span
              className="block h-full rounded-full bg-primary"
              style={{ width: `${progress.avgProgress}%` }}
            />
          </span>
        </div>
      </div>

      {/* Tasks by stage + by assignee */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-xl bg-card ring-1 ring-foreground/10 p-4">
          <h3 className="text-xs font-medium mb-3">Tasks by stage</h3>
          {stages.length > 0 ? (
            <DashboardStageChart stages={stages} />
          ) : (
            <p className="text-sm text-muted-foreground">No tasks yet.</p>
          )}
        </div>
        <div className="rounded-xl bg-card ring-1 ring-foreground/10 p-4">
          <h3 className="text-xs font-medium mb-3">By assignee</h3>
          {assignees.length > 0 ? (
            <div className="flex flex-col gap-2 text-xs">
              {assignees.map((a) => (
                <div key={a.name} className="flex items-center gap-2">
                  <span className="flex w-24 shrink-0 items-center gap-1 text-muted-foreground">
                    <span className="truncate">{a.name}</span>
                    {a.isAgent && (
                      <Badge variant="outline" className="shrink-0">Agent</Badge>
                    )}
                  </span>
                  <span className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <span
                      className="block h-full rounded-full bg-primary/70"
                      style={{ width: `${(a.count / maxAssignee) * 100}%` }}
                    />
                  </span>
                  <span className="w-6 text-right tabular-nums font-medium">
                    {a.count}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No tasks yet.</p>
          )}
        </div>
      </div>

      {/* Meta */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetaRow label="Start date" value={fmtDate(startDate)} />
        <MetaRow label="End date" value={fmtDate(endDate)} />
        <MetaRow label="Created" value={fmtDate(createdAt)} />
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-card ring-1 ring-foreground/10 p-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-sm mt-1">{value}</div>
    </div>
  );
}
