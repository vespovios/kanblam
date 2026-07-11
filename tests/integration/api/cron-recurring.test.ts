import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { setupTestWorkspace, type SeededWorkspace } from "@/tests/integration/helpers/workspace";

const prisma = new PrismaClient();
let seed: SeededWorkspace;
let projectId: string;

beforeEach(async () => {
  process.env.CRON_SECRET = "test-secret";
  seed = await setupTestWorkspace(prisma);
  const p = await prisma.project.create({
    data: { workspaceId: seed.workspaceId, name: "P", code: "P01", statusId: seed.statusIds.notStarted },
  });
  projectId = p.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function seedTemplate() {
  return prisma.recurringTaskTemplate.create({
    data: {
      workspaceId: seed.workspaceId,
      createdById: seed.adminId,
      name: "Standup",
      projectId,
      priorityId: seed.priorityIds.medium,
      kanbanStageId: seed.kanbanStageIds.backlog,
      frequency: "DAILY",
      interval: 1,
      daysOfWeek: [],
      startDate: new Date("2026-04-20T00:00:00Z"),
    },
  });
}

describe("POST /api/cron/generate-recurring-tasks", () => {
  it("rejects without bearer token (401)", async () => {
    const { POST } = await import("@/app/api/cron/generate-recurring-tasks/route");
    const res = await POST(
      new Request("http://localhost/api/cron/generate-recurring-tasks", { method: "POST" }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects with wrong token (401)", async () => {
    const { POST } = await import("@/app/api/cron/generate-recurring-tasks/route");
    const res = await POST(
      new Request("http://localhost/api/cron/generate-recurring-tasks", {
        method: "POST",
        headers: { Authorization: "Bearer wrong" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("with valid token, generates instances and returns count", async () => {
    await seedTemplate();
    const { POST } = await import("@/app/api/cron/generate-recurring-tasks/route");
    const res = await POST(
      new Request("http://localhost/api/cron/generate-recurring-tasks", {
        method: "POST",
        headers: { Authorization: "Bearer test-secret" },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.workspacesProcessed).toBe(1);
    expect(body.instancesCreated).toBeGreaterThan(0);
  });

  it("response includes a failures array (empty when all succeed)", async () => {
    await seedTemplate();
    const { POST } = await import("@/app/api/cron/generate-recurring-tasks/route");
    const res = await POST(
      new Request("http://localhost/api/cron/generate-recurring-tasks", {
        method: "POST",
        headers: { Authorization: "Bearer test-secret" },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.failures)).toBe(true);
    expect(body.failures).toEqual([]);
  });
});
