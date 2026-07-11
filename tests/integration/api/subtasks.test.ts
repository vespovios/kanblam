import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { setupTestWorkspace, type SeededWorkspace } from "@/tests/integration/helpers/workspace";

// Mock the auth module (matches the established pattern used by other API
// integration tests, e.g. tags.test.ts). This indirectly controls what
// `requireWorkspaceContext()` returns, while keeping `WorkspaceAuthError`
// and the rest of the workspace-scope module real.
vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";

import { GET, POST } from "@/app/api/tasks/[id]/subtasks/route";
import { PATCH as REORDER } from "@/app/api/tasks/[id]/subtasks/reorder/route";
import { PATCH as PATCH_ONE, DELETE as DELETE_ONE } from "@/app/api/subtasks/[id]/route";

const prisma = new PrismaClient();
let seed: SeededWorkspace;
let taskId: string;

function mockSessionFor(workspaceId: string, userId: string, role: "ADMIN" | "MEMBER" = "ADMIN") {
  vi.mocked(auth).mockResolvedValue({
    user: { id: userId, email: "u@test.local", workspaceId, role },
    expires: new Date(Date.now() + 86400_000).toISOString(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

beforeEach(async () => {
  seed = await setupTestWorkspace(prisma);
  const project = await prisma.project.create({
    data: { workspaceId: seed.workspaceId, name: "P", code: "P1", statusId: seed.statusIds.notStarted },
  });
  const task = await prisma.task.create({
    data: {
      workspaceId: seed.workspaceId,
      projectId: project.id,
      name: "T",
      priorityId: seed.priorityIds.medium,
      kanbanStageId: seed.kanbanStageIds.backlog,
    },
  });
  taskId = task.id;
  mockSessionFor(seed.workspaceId, seed.adminId);
});

afterAll(async () => {
  await prisma.$disconnect();
});

function makeReq(method: string, body?: unknown) {
  return new Request("http://localhost", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("POST /api/tasks/[id]/subtasks", () => {
  it("creates a subtask and returns 201", async () => {
    const res = await POST(makeReq("POST", { title: "Buy milk" }), {
      params: Promise.resolve({ id: taskId }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.subtask.title).toBe("Buy milk");
    expect(body.subtask.position).toBe(0);
  });

  it("returns 400 on empty title", async () => {
    const res = await POST(makeReq("POST", { title: "" }), {
      params: Promise.resolve({ id: taskId }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when task in another workspace", async () => {
    const other = await prisma.workspace.create({ data: { name: "Other" } });
    mockSessionFor(other.id, seed.adminId);
    const res = await POST(makeReq("POST", { title: "x" }), {
      params: Promise.resolve({ id: taskId }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 409 on the 101st subtask", async () => {
    for (let i = 0; i < 100; i++) {
      await prisma.subtask.create({ data: { taskId, title: `s${i}`, position: i } });
    }
    const res = await POST(makeReq("POST", { title: "overflow" }), {
      params: Promise.resolve({ id: taskId }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/Maximum 100/);
  });
});

describe("GET /api/tasks/[id]/subtasks", () => {
  it("lists in position order", async () => {
    await prisma.subtask.create({ data: { taskId, title: "b", position: 1 } });
    await prisma.subtask.create({ data: { taskId, title: "a", position: 0 } });
    const res = await GET(makeReq("GET"), { params: Promise.resolve({ id: taskId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subtasks.map((s: { title: string }) => s.title)).toEqual(["a", "b"]);
  });
});

describe("PATCH /api/tasks/[id]/subtasks/reorder", () => {
  it("rewrites positions", async () => {
    const a = await prisma.subtask.create({ data: { taskId, title: "A", position: 0 } });
    const b = await prisma.subtask.create({ data: { taskId, title: "B", position: 1 } });
    const c = await prisma.subtask.create({ data: { taskId, title: "C", position: 2 } });
    const res = await REORDER(makeReq("PATCH", { orderedIds: [c.id, a.id, b.id] }), {
      params: Promise.resolve({ id: taskId }),
    });
    expect(res.status).toBe(200);
    const list = await prisma.subtask.findMany({ where: { taskId }, orderBy: { position: "asc" } });
    expect(list.map((s) => s.title)).toEqual(["C", "A", "B"]);
  });

  it("returns 400 on set mismatch", async () => {
    await prisma.subtask.create({ data: { taskId, title: "A", position: 0 } });
    const res = await REORDER(makeReq("PATCH", { orderedIds: ["fake-id"] }), {
      params: Promise.resolve({ id: taskId }),
    });
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/subtasks/[id]", () => {
  it("toggles completed and triggers recompute", async () => {
    const s1 = await prisma.subtask.create({ data: { taskId, title: "a", position: 0 } });
    await prisma.subtask.create({ data: { taskId, title: "b", position: 1 } });
    const res = await PATCH_ONE(makeReq("PATCH", { completed: true }), {
      params: Promise.resolve({ id: s1.id }),
    });
    expect(res.status).toBe(200);
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    expect(task!.progressPct).toBe(50);
  });

  it("returns 404 when subtask is in another workspace", async () => {
    const s = await prisma.subtask.create({ data: { taskId, title: "x", position: 0 } });
    const other = await prisma.workspace.create({ data: { name: "Other" } });
    mockSessionFor(other.id, seed.adminId);
    const res = await PATCH_ONE(makeReq("PATCH", { title: "hijacked" }), {
      params: Promise.resolve({ id: s.id }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 when neither title nor completed provided", async () => {
    const s = await prisma.subtask.create({ data: { taskId, title: "x", position: 0 } });
    const res = await PATCH_ONE(makeReq("PATCH", {}), {
      params: Promise.resolve({ id: s.id }),
    });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/subtasks/[id]", () => {
  it("deletes and returns 200", async () => {
    const s = await prisma.subtask.create({ data: { taskId, title: "x", position: 0 } });
    const res = await DELETE_ONE(makeReq("DELETE"), { params: Promise.resolve({ id: s.id }) });
    expect(res.status).toBe(200);
    const fresh = await prisma.subtask.findUnique({ where: { id: s.id } });
    expect(fresh).toBeNull();
  });

  it("returns 404 across workspaces", async () => {
    const s = await prisma.subtask.create({ data: { taskId, title: "x", position: 0 } });
    const other = await prisma.workspace.create({ data: { name: "Other" } });
    mockSessionFor(other.id, seed.adminId);
    const res = await DELETE_ONE(makeReq("DELETE"), { params: Promise.resolve({ id: s.id }) });
    expect(res.status).toBe(404);
  });
});
