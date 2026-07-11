import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { setupTestWorkspace, type SeededWorkspace } from "@/tests/integration/helpers/workspace";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";

const prisma = new PrismaClient();
let seed: SeededWorkspace;
let projectId: string;

beforeEach(async () => {
  seed = await setupTestWorkspace(prisma);
  vi.mocked(auth).mockResolvedValue({
    user: { id: seed.adminId, email: "admin@test.local", workspaceId: seed.workspaceId, role: "ADMIN" },
    expires: new Date(Date.now() + 86400_000).toISOString(),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  const p = await prisma.project.create({
    data: { workspaceId: seed.workspaceId, name: "P", code: "P01", statusId: seed.statusIds.notStarted },
  });
  projectId = p.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

function validBody() {
  return {
    name: "Standup",
    projectId,
    priorityId: seed.priorityIds.medium,
    kanbanStageId: seed.kanbanStageIds.backlog,
    frequency: "DAILY",
    interval: 1,
    daysOfWeek: [],
    startDate: "2026-04-20",
  };
}

describe("POST /api/recurring-tasks", () => {
  it("creates a template and returns 201", async () => {
    const { POST } = await import("@/app/api/recurring-tasks/route");
    const res = await POST(
      new Request("http://localhost/api/recurring-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody()),
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.template.name).toBe("Standup");
    expect(body.template.frequency).toBe("DAILY");
    const tasks = await prisma.task.findMany({ where: { recurringTemplateId: body.template.id } });
    expect(tasks.length).toBeGreaterThan(0);
  });

  it("returns 400 on invalid input", async () => {
    const { POST } = await import("@/app/api/recurring-tasks/route");
    const res = await POST(
      new Request("http://localhost/api/recurring-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...validBody(), interval: 0 }),
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/recurring-tasks", () => {
  it("returns workspace's templates", async () => {
    const { POST, GET } = await import("@/app/api/recurring-tasks/route");
    await POST(
      new Request("http://localhost/api/recurring-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody()),
      }),
    );
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.templates).toHaveLength(1);
    expect(body.templates[0].name).toBe("Standup");
  });
});

describe("PATCH /api/recurring-tasks/[id]", () => {
  it("updates a template's interval", async () => {
    const { POST } = await import("@/app/api/recurring-tasks/route");
    const created = await POST(
      new Request("http://localhost/api/recurring-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody()),
      }),
    );
    const { template } = await created.json();

    const { PATCH } = await import("@/app/api/recurring-tasks/[id]/route");
    const res = await PATCH(
      new Request("http://localhost/api/recurring-tasks/" + template.id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval: 3 }),
      }),
      { params: Promise.resolve({ id: template.id }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.template.interval).toBe(3);
  });

  it("returns 404 for unknown id", async () => {
    const { PATCH } = await import("@/app/api/recurring-tasks/[id]/route");
    const res = await PATCH(
      new Request("http://localhost/api/recurring-tasks/nope", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval: 2 }),
      }),
      { params: Promise.resolve({ id: "nope" }) },
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/recurring-tasks/[id]", () => {
  it("deletes and returns 200", async () => {
    const { POST } = await import("@/app/api/recurring-tasks/route");
    const created = await POST(
      new Request("http://localhost/api/recurring-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody()),
      }),
    );
    const { template } = await created.json();

    const { DELETE } = await import("@/app/api/recurring-tasks/[id]/route");
    const res = await DELETE(
      new Request("http://localhost/api/recurring-tasks/" + template.id, { method: "DELETE" }),
      { params: Promise.resolve({ id: template.id }) },
    );
    expect(res.status).toBe(200);
    expect(await prisma.recurringTaskTemplate.count()).toBe(0);
  });

  it("returns 404 for unknown id", async () => {
    const { DELETE } = await import("@/app/api/recurring-tasks/[id]/route");
    const res = await DELETE(
      new Request("http://localhost/api/recurring-tasks/nope", { method: "DELETE" }),
      { params: Promise.resolve({ id: "nope" }) },
    );
    expect(res.status).toBe(404);
  });
});
