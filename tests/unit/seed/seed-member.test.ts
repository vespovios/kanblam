import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { seedWorkspace } from "@/prisma/seedWorkspace";

const prisma = new PrismaClient();

async function wipeDb() {
  // Order matters: children before parents.
  // Delete FK-dependent rows first so lookup-table deletes don't violate constraints.
  await prisma.subtask.deleteMany();
  await prisma.subtaskTemplate.deleteMany();
  await prisma.task.deleteMany();
  await prisma.recurringTaskTemplate.deleteMany();
  await prisma.project.deleteMany();
  await prisma.invite.deleteMany();
  await prisma.user.deleteMany();
  await prisma.kanbanStage.deleteMany();
  await prisma.priority.deleteMany();
  await prisma.status.deleteMany();
  await prisma.workspace.deleteMany();
}

describe("seedWorkspace", () => {
  beforeEach(async () => {
    await wipeDb();
  });

  afterAll(async () => {
    await wipeDb();
    await prisma.$disconnect();
  });

  it("creates only the admin when SEED_MEMBER_* env vars are unset", async () => {
    await seedWorkspace(prisma, {
      WORKSPACE_NAME: "Test WS",
      ADMIN_EMAIL: "admin@test.local",
      ADMIN_PASSWORD: "pw",
      ADMIN_NAME: "TestAdmin",
    });
    const users = await prisma.user.findMany();
    expect(users).toHaveLength(1);
    expect(users[0].email).toBe("admin@test.local");
    expect(users[0].name).toBe("TestAdmin");
    expect(users[0].role).toBe("ADMIN");
  });

  it("creates admin + member when SEED_MEMBER_EMAIL is set", async () => {
    await seedWorkspace(prisma, {
      WORKSPACE_NAME: "Test WS",
      ADMIN_EMAIL: "admin@test.local",
      ADMIN_PASSWORD: "pw",
      ADMIN_NAME: "TestAdmin",
      SEED_MEMBER_EMAIL: "member@test.local",
      SEED_MEMBER_PASSWORD: "pw2",
      SEED_MEMBER_NAME: "TestMember",
    });
    const users = await prisma.user.findMany({ orderBy: { email: "asc" } });
    expect(users).toHaveLength(2);

    const admin = users.find((u) => u.email === "admin@test.local")!;
    expect(admin.role).toBe("ADMIN");
    expect(admin.name).toBe("TestAdmin");

    const member = users.find((u) => u.email === "member@test.local")!;
    expect(member.role).toBe("MEMBER");
    expect(member.name).toBe("TestMember");
    expect(member.workspaceId).toBe(admin.workspaceId);
  });

  it("is idempotent — re-running with an existing workspace skips creation", async () => {
    await seedWorkspace(prisma, {
      WORKSPACE_NAME: "Test WS",
      ADMIN_EMAIL: "admin@test.local",
      ADMIN_PASSWORD: "pw",
    });
    // Second call with totally different env should short-circuit on the
    // existing workspace and create no new rows.
    await seedWorkspace(prisma, {
      WORKSPACE_NAME: "Different WS",
      ADMIN_EMAIL: "different@test.local",
      ADMIN_PASSWORD: "pw",
      SEED_MEMBER_EMAIL: "would-not-be-created@test.local",
      SEED_MEMBER_PASSWORD: "pw",
    });

    const users = await prisma.user.findMany();
    const workspaces = await prisma.workspace.findMany();
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0].name).toBe("Test WS");
    expect(users).toHaveLength(1);
    expect(users[0].email).toBe("admin@test.local");
    expect(users[0].name).toBe("Admin"); // default fires when ADMIN_NAME unset
  });

  it("empty-string SEED_MEMBER_PASSWORD falls back to 'change-me', not bcrypt('')", async () => {
    await seedWorkspace(prisma, {
      WORKSPACE_NAME: "Test WS",
      ADMIN_EMAIL: "admin@test.local",
      ADMIN_PASSWORD: "pw",
      ADMIN_NAME: "TestAdmin",
      SEED_MEMBER_EMAIL: "member@test.local",
      SEED_MEMBER_PASSWORD: "", // empty string — must NOT bypass the default
    });
    const users = await prisma.user.findMany();
    const member = users.find((u) => u.email === "member@test.local")!;
    expect(member).toBeDefined();
    const hash = member.passwordHash!; // seeder always sets a hash
    // Empty string must NOT verify against the stored hash
    const emptyMatches = await bcrypt.compare("", hash);
    expect(emptyMatches).toBe(false);
    // The fallback password "change-me" SHOULD verify
    const defaultMatches = await bcrypt.compare("change-me", hash);
    expect(defaultMatches).toBe(true);
  });
});
