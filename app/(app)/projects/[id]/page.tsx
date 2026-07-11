import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/permissions";
import { getProject } from "@/lib/projects/service";
import { prisma } from "@/lib/db";
import { ProjectEditDialog } from "@/components/projects/project-edit-dialog";
import { ProjectStatusBadge } from "@/components/projects/project-status-badge";
import { ProjectDeleteButton } from "@/components/projects/project-delete-button";
import { ProjectCodeName } from "@/components/projects/project-code-name";
import { ProjectTasksTab } from "@/components/tasks/project-tasks-tab";
import { ProjectKanbanTab } from "@/components/kanban/project-kanban-tab";
import { ProjectEisenhowerTab } from "@/components/eisenhower/project-eisenhower-tab";
import { ProjectOverviewTab } from "@/components/projects/project-overview-tab";
import { PageRealtimeBridge } from "@/components/realtime/page-realtime-bridge";
import { Badge } from "@/components/ui/badge";
import type { LaneAxis } from "@/lib/kanban/lanes";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; tags?: string; lane?: string; hideCompleted?: string }>;
}

// "project" is intentionally omitted here — this is a single-project
// detail page, so a project swimlane would only ever produce one lane.
// An unrecognised ?lane= value falls back to the stage view.
function parseLaneAxis(raw: string | undefined): LaneAxis {
  return raw === "assignee" || raw === "tag" ? raw : "none";
}

export default async function ProjectDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { tab = "overview", tags, lane: laneParam, hideCompleted: hideCompletedParam } = await searchParams;
  const tagIds = tags ? tags.split(",").filter(Boolean) : [];
  const lane = parseLaneAxis(laneParam);
  const hideCompleted = hideCompletedParam === "true";
  // Global filter params to carry across the in-page sub-tab nav so toggling a
  // filter on one tab isn't silently dropped when switching tabs.
  const tabFilters = new URLSearchParams();
  if (tags) tabFilters.set("tags", tags);
  if (hideCompleted) tabFilters.set("hideCompleted", "true");
  const tabFilterQs = tabFilters.toString();
  const user = await requireUser();
  const project = await getProject(user.workspaceId, id);
  if (!project) notFound();

  const [statuses, members, allTags] = await Promise.all([
    prisma.status.findMany({ where: { workspaceId: user.workspaceId }, orderBy: { order: "asc" } }),
    prisma.user.findMany({
      where: { workspaceId: user.workspaceId },
      select: { id: true, name: true, email: true, kind: true },
      orderBy: { name: "asc" },
    }),
    prisma.tag.findMany({
      where: { workspaceId: user.workspaceId },
      include: { _count: { select: { tasks: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  // Overview-tab data — the project's tasks, just enough of each to derive
  // progress + the stage / assignee breakdowns. Fetched only for the
  // Overview tab so the other tabs (which load their own task data) don't
  // pay for it.
  const overviewTasks =
    tab === "overview"
      ? await prisma.task.findMany({
          where: { projectId: id, workspaceId: user.workspaceId },
          select: {
            progressPct: true,
            kanbanStage: {
              select: {
                id: true,
                name: true,
                color: true,
                order: true,
                isTerminal: true,
              },
            },
            assignee: { select: { id: true, name: true, email: true, kind: true } },
          },
        })
      : [];

  return (
    <div className="space-y-6">
      <PageRealtimeBridge
        kinds={
          tab === "kanban"
            ? ["projects", "tasks", "tags", "members", "kanban_stages"]
            : ["projects", "tasks", "tags", "members"]
        }
      />
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/projects" className="text-sm text-muted-foreground hover:underline">← Projects</Link>
          <h2 className="text-2xl font-semibold mt-1">
            {/* qa#9 / Hermes #5: ProjectCodeName puts real text-node spaces
                between code, em-dash, and name. The previous mr-2 version
                rendered visually correct but textContent was the mashed
                "P01—Finish KanBlam site" — broke screen readers / copy. */}
            <ProjectCodeName
              code={project.code}
              name={project.name}
              separator="—"
              codeClassName="text-sm"
            />
          </h2>
          <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
            <ProjectStatusBadge status={project.status} />
            {project.clientName && <span>Client: {project.clientName}</span>}
            {project.projectLead && (
              <span>
                Lead: {project.projectLead.name ?? project.projectLead.email}
                {project.projectLead.kind === "AGENT" && (
                  <Badge variant="outline" className="ml-1.5">Agent</Badge>
                )}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <ProjectEditDialog project={project} statuses={statuses} members={members} />
          <ProjectDeleteButton projectId={project.id} projectName={project.name} />
        </div>
      </div>

      <div className="border-b">
        <nav className="flex gap-6 pt-2 text-sm">
          <Tab id={id} slug="overview" current={tab} label="Overview" filterQs={tabFilterQs} />
          <Tab id={id} slug="tasks" current={tab} label="Tasks" filterQs={tabFilterQs} />
          <Tab id={id} slug="kanban" current={tab} label="Kanban" filterQs={tabFilterQs} />
          <Tab id={id} slug="eisenhower" current={tab} label="Eisenhower" filterQs={tabFilterQs} />
        </nav>
      </div>

      {tab === "overview" && (
        <ProjectOverviewTab
          tasks={overviewTasks}
          startDate={project.startDate}
          endDate={project.endDate}
          createdAt={project.createdAt}
        />
      )}

      {tab === "tasks" && (
        <ProjectTasksTab
          projectId={id}
          workspaceId={user.workspaceId}
          currentUserId={user.id}
          members={members}
          allTags={allTags}
          tagIds={tagIds}
          hideCompleted={hideCompleted}
        />
      )}

      {tab === "kanban" && (
        <ProjectKanbanTab
          projectId={id}
          workspaceId={user.workspaceId}
          currentUserId={user.id}
          allTags={allTags}
          tagIds={tagIds}
          lane={lane}
          hideCompleted={hideCompleted}
        />
      )}

      {tab === "eisenhower" && (
        <ProjectEisenhowerTab
          projectId={id}
          workspaceId={user.workspaceId}
          allTags={allTags}
          tagIds={tagIds}
          hideCompleted={hideCompleted}
        />
      )}
    </div>
  );
}

function Tab({
  id,
  slug,
  current,
  label,
  filterQs,
}: {
  id: string;
  slug: string;
  current: string;
  label: string;
  /** Global filter params (tags, hideCompleted) preserved across tab switches. */
  filterQs?: string;
}) {
  const active = current === slug;
  const href = `/projects/${id}?tab=${slug}${filterQs ? `&${filterQs}` : ""}`;
  return (
    <Link
      href={href}
      className={`pb-2 ${active ? "font-medium border-b-2 border-primary" : "text-muted-foreground"}`}
    >
      {label}
    </Link>
  );
}
