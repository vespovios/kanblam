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
  } as any);
  const p = await prisma.project.create({
    data: { workspaceId: seed.workspaceId, name: "P", code: "P01", statusId: seed.statusIds.notStarted },
  });
  projectId = p.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

function minimalTaskBody() {
  return {
    projectId,
    name: "Task",
    priorityId: seed.priorityIds.medium,
    kanbanStageId: seed.kanbanStageIds.backlog,
  };
}

describe("POST /api/tasks", () => {
  it("creates a task and returns 201", async () => {
    const { POST } = await import("@/app/api/tasks/route");
    const res = await POST(
      new Request("http://localhost/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(minimalTaskBody()),
      }),
    );
    expect(res.status).toBe(201);
    expect(await prisma.task.count()).toBe(1);
  });

  it("returns 400 on invalid input", async () => {
    const { POST } = await import("@/app/api/tasks/route");
    const res = await POST(
      new Request("http://localhost/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...minimalTaskBody(), name: "" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("defaults assigneeId to the requesting user when not supplied", async () => {
    const { POST } = await import("@/app/api/tasks/route");
    const res = await POST(
      new Request("http://x/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          name: "no-assignee-in-body",
          priorityId: seed.priorityIds.medium,
          kanbanStageId: seed.kanbanStageIds.backlog,
        }),
      }),
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.task.assignee?.id).toBe(seed.adminId);
  });

  it("respects explicit assigneeId in the body", async () => {
    const { POST } = await import("@/app/api/tasks/route");
    const res = await POST(
      new Request("http://x/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          name: "explicit-assignee",
          priorityId: seed.priorityIds.medium,
          kanbanStageId: seed.kanbanStageIds.backlog,
          assigneeId: seed.memberId,
        }),
      }),
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.task.assignee?.id).toBe(seed.memberId);
  });

  it("rejects assigneeId belonging to a different workspace (workspace isolation)", async () => {
    // Seed a second workspace + admin. Forging that user's id as the assignee
    // for a task in workspace #1 must NOT silently succeed — without the
    // workspaceId-scoped membership lookup, a stranger could be assigned tasks
    // in tenants they don't belong to.
    const ws2 = await prisma.workspace.create({ data: { name: "OtherWS" } });
    const ws2Admin = await prisma.user.create({
      data: { workspaceId: ws2.id, email: "stranger@other.local", role: "ADMIN", name: "Stranger" },
    });

    const { POST } = await import("@/app/api/tasks/route");
    const res = await POST(
      new Request("http://x/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          name: "forged-assignee",
          priorityId: seed.priorityIds.medium,
          kanbanStageId: seed.kanbanStageIds.backlog,
          assigneeId: ws2Admin.id,
        }),
      }),
    );
    expect(res.status).toBe(404);
    expect(await prisma.task.count({ where: { name: "forged-assignee" } })).toBe(0);
  });
});

describe("GET /api/tasks", () => {
  it("returns workspace tasks", async () => {
    await prisma.task.create({
      data: {
        workspaceId: seed.workspaceId,
        projectId,
        name: "T1",
        priorityId: seed.priorityIds.medium,
        kanbanStageId: seed.kanbanStageIds.backlog,
      },
    });
    const { GET } = await import("@/app/api/tasks/route");
    const res = await GET(new Request("http://localhost/api/tasks"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tasks).toHaveLength(1);
  });

  it("filters by projectId query param", async () => {
    const p2 = await prisma.project.create({
      data: { workspaceId: seed.workspaceId, name: "P2", code: "P02", statusId: seed.statusIds.notStarted },
    });
    await prisma.task.create({
      data: {
        workspaceId: seed.workspaceId,
        projectId,
        name: "A",
        priorityId: seed.priorityIds.medium,
        kanbanStageId: seed.kanbanStageIds.backlog,
      },
    });
    await prisma.task.create({
      data: {
        workspaceId: seed.workspaceId,
        projectId: p2.id,
        name: "B",
        priorityId: seed.priorityIds.medium,
        kanbanStageId: seed.kanbanStageIds.backlog,
      },
    });
    const { GET } = await import("@/app/api/tasks/route");
    const res = await GET(new Request(`http://localhost/api/tasks?projectId=${p2.id}`));
    const body = await res.json();
    expect(body.tasks).toHaveLength(1);
    expect(body.tasks[0].name).toBe("B");
  });
});

describe("PATCH + DELETE /api/tasks/[id]", () => {
  it("updates a task", async () => {
    const t = await prisma.task.create({
      data: {
        workspaceId: seed.workspaceId,
        projectId,
        name: "Old",
        priorityId: seed.priorityIds.medium,
        kanbanStageId: seed.kanbanStageIds.backlog,
      },
    });
    const { PATCH } = await import("@/app/api/tasks/[id]/route");
    const res = await PATCH(
      new Request(`http://localhost/api/tasks/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New" }),
      }),
      { params: Promise.resolve({ id: t.id }) },
    );
    expect(res.status).toBe(200);
    const after = await prisma.task.findUniqueOrThrow({ where: { id: t.id } });
    expect(after.name).toBe("New");
  });

  it("deletes a task", async () => {
    const t = await prisma.task.create({
      data: {
        workspaceId: seed.workspaceId,
        projectId,
        name: "X",
        priorityId: seed.priorityIds.medium,
        kanbanStageId: seed.kanbanStageIds.backlog,
      },
    });
    const { DELETE } = await import("@/app/api/tasks/[id]/route");
    const res = await DELETE(new Request(`http://localhost/api/tasks/${t.id}`), {
      params: Promise.resolve({ id: t.id }),
    });
    expect(res.status).toBe(200);
    expect(await prisma.task.count({ where: { id: t.id } })).toBe(0);
  });

  it("PATCH accepts and persists startDate", async () => {
    const t = await prisma.task.create({
      data: {
        workspaceId: seed.workspaceId,
        projectId,
        name: "p",
        priorityId: seed.priorityIds.medium,
        kanbanStageId: seed.kanbanStageIds.backlog,
      },
    });
    const { PATCH } = await import("@/app/api/tasks/[id]/route");
    const res = await PATCH(
      new Request(`http://x/api/tasks/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: "2026-05-10", dueDate: "2026-05-15" }),
      }),
      { params: Promise.resolve({ id: t.id }) },
    );
    expect(res.status).toBe(200);
    const after = await prisma.task.findUniqueOrThrow({
      where: { id: t.id },
      select: { startDate: true, dueDate: true },
    });
    expect(after.startDate?.toISOString().slice(0, 10)).toBe("2026-05-10");
    expect(after.dueDate?.toISOString().slice(0, 10)).toBe("2026-05-15");
  });

  it("PATCH rejects assigneeId belonging to a different workspace (workspace isolation)", async () => {
    const t = await prisma.task.create({
      data: {
        workspaceId: seed.workspaceId,
        projectId,
        name: "p",
        priorityId: seed.priorityIds.medium,
        kanbanStageId: seed.kanbanStageIds.backlog,
        assigneeId: seed.adminId,
      },
    });
    const ws2 = await prisma.workspace.create({ data: { name: "OtherWS" } });
    const ws2Admin = await prisma.user.create({
      data: { workspaceId: ws2.id, email: "stranger@other.local", role: "ADMIN", name: "Stranger" },
    });

    const { PATCH } = await import("@/app/api/tasks/[id]/route");
    const res = await PATCH(
      new Request(`http://x/api/tasks/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigneeId: ws2Admin.id }),
      }),
      { params: Promise.resolve({ id: t.id }) },
    );
    expect(res.status).toBe(404);
    const after = await prisma.task.findUniqueOrThrow({
      where: { id: t.id },
      select: { assigneeId: true },
    });
    expect(after.assigneeId).toBe(seed.adminId);
  });

  it("PATCH rejects startDate > dueDate", async () => {
    const t = await prisma.task.create({
      data: {
        workspaceId: seed.workspaceId,
        projectId,
        name: "p",
        priorityId: seed.priorityIds.medium,
        kanbanStageId: seed.kanbanStageIds.backlog,
      },
    });
    const { PATCH } = await import("@/app/api/tasks/[id]/route");
    const res = await PATCH(
      new Request(`http://x/api/tasks/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: "2026-05-15", dueDate: "2026-05-10" }),
      }),
      { params: Promise.resolve({ id: t.id }) },
    );
    expect(res.status).toBe(400);
  });

  it("PATCH moves a task to another project in the same workspace", async () => {
    const t = await prisma.task.create({
      data: {
        workspaceId: seed.workspaceId,
        projectId,
        name: "movable",
        priorityId: seed.priorityIds.medium,
        kanbanStageId: seed.kanbanStageIds.backlog,
      },
    });
    const dest = await prisma.project.create({
      data: {
        workspaceId: seed.workspaceId,
        name: "Dest",
        code: "P02",
        statusId: seed.statusIds.notStarted,
      },
    });
    const { PATCH } = await import("@/app/api/tasks/[id]/route");
    const res = await PATCH(
      new Request(`http://x/api/tasks/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: dest.id }),
      }),
      { params: Promise.resolve({ id: t.id }) },
    );
    expect(res.status).toBe(200);
    const after = await prisma.task.findUniqueOrThrow({
      where: { id: t.id },
      select: { projectId: true, kanbanStageId: true },
    });
    expect(after.projectId).toBe(dest.id);
    // Kanban stage is workspace-scoped, so it survives the move untouched.
    expect(after.kanbanStageId).toBe(seed.kanbanStageIds.backlog);
  });

  it("PATCH rejects a projectId belonging to a different workspace (workspace isolation)", async () => {
    const t = await prisma.task.create({
      data: {
        workspaceId: seed.workspaceId,
        projectId,
        name: "p",
        priorityId: seed.priorityIds.medium,
        kanbanStageId: seed.kanbanStageIds.backlog,
      },
    });
    const ws2 = await prisma.workspace.create({ data: { name: "OtherWS" } });
    const ws2Status = await prisma.status.create({
      data: { workspaceId: ws2.id, name: "NS", color: "#888888", order: 0 },
    });
    const ws2Project = await prisma.project.create({
      data: { workspaceId: ws2.id, name: "Foreign", code: "X01", statusId: ws2Status.id },
    });
    const { PATCH } = await import("@/app/api/tasks/[id]/route");
    const res = await PATCH(
      new Request(`http://x/api/tasks/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: ws2Project.id }),
      }),
      { params: Promise.resolve({ id: t.id }) },
    );
    expect(res.status).toBe(404);
    const after = await prisma.task.findUniqueOrThrow({
      where: { id: t.id },
      select: { projectId: true },
    });
    expect(after.projectId).toBe(projectId);
  });
});
