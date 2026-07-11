import type { Metadata } from "next";
import { AlertTriangle, CalendarClock, CalendarRange, CircleCheck } from "lucide-react";
import { requireUser } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { isWorkingDay } from "@/lib/dates/working-days";
import { listTodayBuckets } from "@/lib/tasks/today";
import { computeProjectProgress } from "@/lib/projects/progress";
import { TodaySection } from "@/components/today/today-section";
import { StatCard } from "@/components/dashboard/stat-card";
import { DashboardStageChart } from "@/components/dashboard/dashboard-stage-chart";
import { DashboardPriorityBars } from "@/components/dashboard/dashboard-priority-bars";
import { DashboardWeekChart } from "@/components/dashboard/dashboard-week-chart";
import { DashboardProjectProgress } from "@/components/dashboard/dashboard-project-progress";
import { DashboardRecentActivity } from "@/components/dashboard/dashboard-recent-activity";
import { PageRealtimeBridge } from "@/components/realtime/page-realtime-bridge";

export const metadata: Metadata = {
  title: "DayDash · KanBlam!",
};

const WEEK_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_MS = 24 * 60 * 60 * 1000;

export default async function DashboardPage() {
  const user = await requireUser();
  const workspaceId = user.workspaceId;

  // "Today" as UTC midnight — lines up with how Prisma serialises @db.Date
  // holiday rows and the isWorkingDay helper. Server runs UTC.
  const now = new Date();
  const startOfToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const startOfTomorrow = new Date(startOfToday.getTime() + DAY_MS);

  // Current ISO week (Mon-Sun) bounds for the 7-day chart + "due this week".
  const isoDow = (startOfToday.getUTCDay() + 6) % 7; // 0 = Monday
  const weekStart = new Date(startOfToday.getTime() - isoDow * DAY_MS);
  const weekEnd = new Date(weekStart.getTime() + 7 * DAY_MS); // exclusive

  // --- workspace context ---
  const [workspace, holidays, kanbanStages, priorities] = await Promise.all([
    prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { workingDays: true },
    }),
    prisma.holiday.findMany({
      where: { workspaceId },
      select: { date: true },
    }),
    prisma.kanbanStage.findMany({
      where: { workspaceId },
      orderBy: { order: "asc" },
      select: { id: true, name: true, color: true, isTerminal: true },
    }),
    prisma.priority.findMany({
      where: { workspaceId },
      orderBy: { order: "asc" },
      select: { id: true, name: true, color: true },
    }),
  ]);

  const holidayDates = holidays.map((h) => h.date);
  const workingToday = isWorkingDay(startOfToday, workspace.workingDays, holidayDates);

  // --- dashboard data ---
  const [
    buckets,
    stageGroups,
    priorityGroups,
    weekDueTasks,
    projects,
    recentTasks,
    overdueCount,
    dueTodayCount,
  ] = await Promise.all([
    // Action lists — working-day-gated (empty on a non-working day).
    listTodayBuckets(workspaceId, now, { workingToday }),
    // Per-stage and per-priority task counts.
    prisma.task.groupBy({
      by: ["kanbanStageId"],
      where: { workspaceId },
      _count: { _all: true },
    }),
    prisma.task.groupBy({
      by: ["priorityId"],
      where: { workspaceId },
      _count: { _all: true },
    }),
    // Non-terminal tasks due within the current ISO week — drives both the
    // "due this week" stat card and the 7-day chart.
    prisma.task.findMany({
      where: {
        workspaceId,
        kanbanStage: { isTerminal: false },
        dueDate: { gte: weekStart, lt: weekEnd },
      },
      select: { dueDate: true },
    }),
    // Projects + just enough of each task to derive progress.
    prisma.project.findMany({
      where: { workspaceId },
      orderBy: { code: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        tasks: {
          select: {
            progressPct: true,
            kanbanStage: { select: { isTerminal: true } },
          },
        },
      },
    }),
    // Recent activity — newest-updated tasks.
    prisma.task.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: {
        id: true,
        name: true,
        updatedAt: true,
        project: { select: { code: true } },
        assignee: { select: { name: true, email: true } },
        kanbanStage: { select: { name: true, color: true } },
      },
    }),
    // Stat-card counts — always computed, independent of the working-day
    // gate so the pulse numbers stay honest even on a non-working day.
    prisma.task.count({
      where: {
        workspaceId,
        kanbanStage: { isTerminal: false },
        dueDate: { lt: startOfToday },
      },
    }),
    prisma.task.count({
      where: {
        workspaceId,
        kanbanStage: { isTerminal: false },
        dueDate: { gte: startOfToday, lt: startOfTomorrow },
      },
    }),
  ]);

  // --- derive: stage distribution + completion % ---
  const stageCount = new Map(stageGroups.map((g) => [g.kanbanStageId, g._count._all]));
  const stages = kanbanStages.map((s) => ({
    name: s.name,
    color: s.color,
    count: stageCount.get(s.id) ?? 0,
  }));
  const totalTasks = stages.reduce((sum, s) => sum + s.count, 0);
  const completedTasks = kanbanStages
    .filter((s) => s.isTerminal)
    .reduce((sum, s) => sum + (stageCount.get(s.id) ?? 0), 0);
  const completionPct =
    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // --- derive: priority distribution ---
  const priorityCount = new Map(priorityGroups.map((g) => [g.priorityId, g._count._all]));
  const priorityData = priorities.map((p) => ({
    name: p.name,
    color: p.color,
    count: priorityCount.get(p.id) ?? 0,
  }));

  // --- derive: 7-day "due this week" buckets ---
  const dueByDay = [0, 0, 0, 0, 0, 0, 0];
  for (const t of weekDueTasks) {
    if (!t.dueDate) continue;
    const idx = Math.floor((t.dueDate.getTime() - weekStart.getTime()) / DAY_MS);
    if (idx >= 0 && idx < 7) dueByDay[idx]++;
  }
  const weekChartData = WEEK_LABELS.map((label, i) => ({
    label,
    count: dueByDay[i],
    isToday: i === isoDow,
  }));

  // --- derive: project progress, laggards first ---
  const projectProgress = projects
    .map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      ...computeProjectProgress(p.tasks),
    }))
    .sort((a, b) => a.avgProgress - b.avgProgress);

  // --- derive: recent activity rows ---
  const recentRows = recentTasks.map((t) => {
    const display = t.assignee ? (t.assignee.name ?? t.assignee.email) : null;
    return {
      id: t.id,
      name: t.name,
      projectCode: t.project.code,
      assigneeInitials: display ? display.slice(0, 2).toUpperCase() : null,
      stageName: t.kanbanStage.name,
      stageColor: t.kanbanStage.color,
      updatedAt: t.updatedAt.toISOString(),
    };
  });

  const projectCount = projects.length;

  return (
    <div className="space-y-5">
      <PageRealtimeBridge kinds={["tasks", "projects", "holidays", "working_days"]} />

      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-semibold">
          Welcome back{user.name ? `, ${user.name}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground">
          {projectCount === 0
            ? "No projects yet — create one from the Projects page."
            : `${projectCount} project${projectCount === 1 ? "" : "s"} in your workspace.`}
          {!workingToday && " · Today is a non-working day — daily action lists are paused, but overdue and urgent items still surface below."}
        </p>
      </div>

      {/* Pulse — at-a-glance stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={AlertTriangle} label="Overdue" value={overdueCount} tone="danger" />
        <StatCard icon={CalendarClock} label="Due today" value={dueTodayCount} tone="warning" />
        <StatCard icon={CalendarRange} label="Due this week" value={weekDueTasks.length} tone="info" />
        <StatCard icon={CircleCheck} label="Completion" value={`${completionPct}%`} tone="success" />
      </div>

      {/* Needs you today — action lists */}
      <section className="space-y-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Needs you today
        </h2>
        {workingToday && (
          <div className="grid md:grid-cols-2 gap-3">
            <TodaySection
              title="Overdue"
              emptyText="All caught up — nothing overdue."
              rows={buckets.overdue}
              variant="overdue"
              accent="danger"
            />
            <TodaySection
              title="Due today"
              emptyText="Nothing due today."
              rows={buckets.dueToday}
              variant="normal"
              accent="warning"
            />
          </div>
        )}
        <TodaySection
          title="Q1 — Important + Urgent"
          emptyText="No urgent + important tasks."
          rows={buckets.q1}
          variant="normal"
          accent="info"
        />
      </section>

      {/* Shape of the work — distributions + project progress */}
      <section className="space-y-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Shape of the work
        </h2>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="rounded-xl bg-card ring-1 ring-foreground/10 p-4">
            <h3 className="text-xs font-medium mb-3">Tasks by stage</h3>
            <DashboardStageChart stages={stages} />
          </div>
          <div className="rounded-xl bg-card ring-1 ring-foreground/10 p-4">
            <h3 className="text-xs font-medium mb-3">By priority</h3>
            <DashboardPriorityBars priorities={priorityData} />
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="rounded-xl bg-card ring-1 ring-foreground/10 p-4">
            <h3 className="text-xs font-medium mb-1">Due this week</h3>
            <DashboardWeekChart days={weekChartData} />
          </div>
          <div className="rounded-xl bg-card ring-1 ring-foreground/10 p-4">
            <h3 className="text-xs font-medium mb-3">Project progress</h3>
            <DashboardProjectProgress projects={projectProgress} />
          </div>
        </div>
      </section>

      {/* Recent activity */}
      <section className="space-y-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Recent activity
        </h2>
        <div className="rounded-xl bg-card ring-1 ring-foreground/10 overflow-hidden">
          <DashboardRecentActivity rows={recentRows} />
        </div>
      </section>
    </div>
  );
}
