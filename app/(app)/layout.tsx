import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Topbar } from "@/components/app-shell/topbar";
import { QuickAddProvider } from "@/components/quick-add/quick-add-provider";
import { RealtimeSync } from "@/components/realtime/realtime-sync";
import { ReadOnlyProvider } from "@/components/billing/read-only-provider";
import { ReadOnlyBanner } from "@/components/billing/read-only-banner";
import { DemoBanner } from "@/components/demo/demo-banner";
import { getWorkspaceAccessLevel } from "@/lib/billing/access";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const workspaceId = session.user.workspaceId;
  const accessLevel = await getWorkspaceAccessLevel(workspaceId);
  const readOnly = accessLevel !== "full";

  const [workspace, projects, tags, members, priorities, kanbanStages] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true },
    }),
    prisma.project.findMany({
      where: { workspaceId },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
    prisma.tag.findMany({
      where: { workspaceId },
      select: { id: true, name: true, color: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { workspaceId },
      select: { id: true, name: true, email: true },
      orderBy: { email: "asc" },
    }),
    prisma.priority.findMany({
      where: { workspaceId },
      select: { id: true, name: true },
      orderBy: { order: "asc" },
    }),
    prisma.kanbanStage.findMany({
      where: { workspaceId },
      select: { id: true, name: true, order: true },
      orderBy: { order: "asc" },
    }),
  ]);

  return (
    <RealtimeSync>
      <ReadOnlyProvider readOnly={readOnly}>
        <QuickAddProvider
          projects={projects}
          tags={tags}
          members={members}
          priorities={priorities}
          kanbanStages={kanbanStages}
          currentUserId={session.user.id}
        >
          <div className="min-h-screen flex flex-col bg-background text-foreground">
            <ReadOnlyBanner accessLevel={accessLevel} />
            <Topbar
              workspaceName={workspace?.name ?? "Workspace"}
              userName={session.user.name ?? null}
              userEmail={session.user.email}
              role={session.user.role}
              projects={projects}
              members={members}
              allTags={tags}
            />
            <main className="flex-1 p-6">{children}</main>
            {/* Vikunja-style "this is a demo" warning — DEMO_MODE deployments only */}
            {process.env.DEMO_MODE === "1" && <DemoBanner />}
          </div>
        </QuickAddProvider>
      </ReadOnlyProvider>
    </RealtimeSync>
  );
}
