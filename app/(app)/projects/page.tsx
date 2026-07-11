import { requireUser } from "@/lib/auth/permissions";
import { listProjects } from "@/lib/projects/service";
import { prisma } from "@/lib/db";
import { ProjectsList } from "@/components/projects/projects-list";
import { ProjectCreateDialog } from "@/components/projects/project-create-dialog";
import { PageRealtimeBridge } from "@/components/realtime/page-realtime-bridge";

export default async function ProjectsPage() {
  const user = await requireUser();
  const [projects, statuses, members] = await Promise.all([
    listProjects(user.workspaceId),
    prisma.status.findMany({ where: { workspaceId: user.workspaceId }, orderBy: { order: "asc" } }),
    prisma.user.findMany({
      where: { workspaceId: user.workspaceId },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageRealtimeBridge kinds={["projects", "tasks", "tags", "members"]} />
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Projects</h2>
          <p className="text-muted-foreground">All projects in your workspace.</p>
        </div>
        <ProjectCreateDialog statuses={statuses} members={members} />
      </div>
      <ProjectsList projects={projects} />
    </div>
  );
}
