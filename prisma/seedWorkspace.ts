import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// "Pending" was dropped 2026-05-24 (beta feedback): for solo & small teams
// it's redundant with "Not Started", and "On Hold" / "Delayed" cover the
// rest. Existing workspaces are migrated by the matching data migration.
export const DEFAULT_STATUSES = [
  { name: "Not Started", color: "#9ca3af", order: 1 },
  { name: "In Progress", color: "#3b82f6", order: 2 },
  { name: "On Hold", color: "#a78bfa", order: 3 },
  { name: "Delayed", color: "#ef4444", order: 4 },
  { name: "Completed", color: "#10b981", order: 5 },
  { name: "Cancelled", color: "#6b7280", order: 6 },
];

export const DEFAULT_PRIORITIES = [
  { name: "Very High", color: "#dc2626", order: 1 },
  { name: "High", color: "#f97316", order: 2 },
  { name: "Medium", color: "#f59e0b", order: 3 },
  { name: "Low", color: "#3b82f6", order: 4 },
  { name: "Very Low", color: "#6b7280", order: 5 },
];

// "On Hold" (renamed from "Backlog" 2026-05-24, beta feedback) sits third,
// after "In Progress": work that has stalled — blocked, or parked for later.
// Existing workspaces are migrated by the matching data migration.
export const DEFAULT_KANBAN_STAGES = [
  { name: "Ideas", color: "#e0e9f3", order: 1, isTerminal: false },
  { name: "In Progress", color: "#e8f0dc", order: 2, isTerminal: false },
  { name: "On Hold", color: "#f5e8e4", order: 3, isTerminal: false },
  { name: "Completed", color: "#d1fae5", order: 4, isTerminal: true },
  { name: "Cancelled", color: "#e5e7eb", order: 5, isTerminal: false },
];

export async function seedWorkspace(
  prisma: PrismaClient,
  env: Record<string, string | undefined> = process.env,
): Promise<void> {
  const workspaceName = env.WORKSPACE_NAME ?? "Default Workspace";
  const adminEmail = env.ADMIN_EMAIL ?? "admin@example.com";
  const adminPassword = env.ADMIN_PASSWORD || "change-me";
  const adminName = env.ADMIN_NAME ?? "Admin";

  const existing = await prisma.workspace.findFirst();
  if (existing) {
    console.log(`Workspace "${existing.name}" already exists; skipping seed.`);
    return;
  }

  const workspace = await prisma.workspace.create({
    data: { name: workspaceName },
  });
  console.log(`✔ Created workspace: ${workspace.name}`);

  const adminHash = await bcrypt.hash(adminPassword, 10);
  const admin = await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      email: adminEmail,
      name: adminName,
      passwordHash: adminHash,
      role: "ADMIN",
    },
  });
  console.log(`✔ Created admin user: ${admin.email}`);

  if (env.SEED_MEMBER_EMAIL) {
    if (env.SEED_MEMBER_EMAIL === adminEmail) {
      throw new Error("SEED_MEMBER_EMAIL must differ from ADMIN_EMAIL");
    }
    const memberPassword = env.SEED_MEMBER_PASSWORD || "change-me";
    const memberName = env.SEED_MEMBER_NAME ?? "Member";
    const memberHash = await bcrypt.hash(memberPassword, 10);
    const member = await prisma.user.create({
      data: {
        workspaceId: workspace.id,
        email: env.SEED_MEMBER_EMAIL,
        name: memberName,
        passwordHash: memberHash,
        role: "MEMBER",
      },
    });
    console.log(`✔ Created member user: ${member.email}`);
  }

  await prisma.status.createMany({
    data: DEFAULT_STATUSES.map((s) => ({ ...s, workspaceId: workspace.id })),
  });
  await prisma.priority.createMany({
    data: DEFAULT_PRIORITIES.map((p) => ({ ...p, workspaceId: workspace.id })),
  });
  await prisma.kanbanStage.createMany({
    data: DEFAULT_KANBAN_STAGES.map((k) => ({ ...k, workspaceId: workspace.id })),
  });
  console.log(
    `✔ Seeded ${DEFAULT_STATUSES.length} statuses, ${DEFAULT_PRIORITIES.length} priorities, ${DEFAULT_KANBAN_STAGES.length} kanban stages`,
  );
}
