import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { setupTestWorkspace, type SeededWorkspace } from "@/tests/integration/helpers/workspace";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";

const prisma = new PrismaClient();
let seed: SeededWorkspace;
let taskId: string;

beforeEach(async () => {
  seed = await setupTestWorkspace(prisma);
  vi.mocked(auth).mockResolvedValue({
    user: { id: seed.adminId, email: "admin@test.local", workspaceId: seed.workspaceId, role: "ADMIN" },
    expires: new Date(Date.now() + 86400_000).toISOString(),
  } as any);
  const p = await prisma.project.create({
    data: { workspaceId: seed.workspaceId, name: "P", code: "P01", statusId: seed.statusIds.notStarted },
  });
  const t = await prisma.task.create({
    data: {
      workspaceId: seed.workspaceId,
      projectId: p.id,
      name: "T",
      priorityId: seed.priorityIds.medium,
      kanbanStageId: seed.kanbanStageIds.backlog,
    },
  });
  taskId = t.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

function req(body: unknown) {
  return new Request(`http://localhost/api/tasks/${taskId}/move`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/tasks/[id]/move", () => {
  it("moves a task and returns 200 with updated task", async () => {
    const { POST } = await import("@/app/api/tasks/[id]/move/route");
    const res = await POST(req({ kanbanStageId: seed.kanbanStageIds.inProgress }), {
      params: Promise.resolve({ id: taskId }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.task.kanbanStageId).toBe(seed.kanbanStageIds.inProgress);
  });

  it("returns 400 on invalid input", async () => {
    const { POST } = await import("@/app/api/tasks/[id]/move/route");
    const res = await POST(req({ newIndex: -1 }), { params: Promise.resolve({ id: taskId }) });
    expect(res.status).toBe(400);
  });

  it("returns 404 when task is not found", async () => {
    const { POST } = await import("@/app/api/tasks/[id]/move/route");
    const res = await POST(
      new Request("http://localhost/api/tasks/nope/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kanbanStageId: seed.kanbanStageIds.inProgress }),
      }),
      { params: Promise.resolve({ id: "nope" }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const { POST } = await import("@/app/api/tasks/[id]/move/route");
    const res = await POST(req({ kanbanStageId: seed.kanbanStageIds.inProgress }), {
      params: Promise.resolve({ id: taskId }),
    });
    expect(res.status).toBe(401);
  });

  it("accepts assigneeId and persists it on the moved task", async () => {
    const { POST } = await import("@/app/api/tasks/[id]/move/route");
    const res = await POST(
      new Request(`http://x/api/tasks/${taskId}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kanbanStageId: seed.kanbanStageIds.inProgress,
          newIndex: 0,
          assigneeId: seed.memberId,
        }),
      }),
      { params: Promise.resolve({ id: taskId }) },
    );
    expect(res.status).toBe(200);
    const after = await prisma.task.findUniqueOrThrow({
      where: { id: taskId },
      select: { assigneeId: true, kanbanStageId: true },
    });
    expect(after.assigneeId).toBe(seed.memberId);
    expect(after.kanbanStageId).toBe(seed.kanbanStageIds.inProgress);
  });

  it("rejects assigneeId that is not a workspace member (returns 404)", async () => {
    const { POST } = await import("@/app/api/tasks/[id]/move/route");
    const res = await POST(
      new Request(`http://x/api/tasks/${taskId}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kanbanStageId: seed.kanbanStageIds.inProgress,
          newIndex: 0,
          assigneeId: "non-existent-user-id",
        }),
      }),
      { params: Promise.resolve({ id: taskId }) },
    );
    expect(res.status).toBe(404);
  });

  it("preserves existing assigneeId when assigneeId is omitted from the body", async () => {
    // Pre-condition: ensure the task has an assignee from setup.
    await prisma.task.update({
      where: { id: taskId },
      data: { assigneeId: seed.adminId },
    });

    const { POST } = await import("@/app/api/tasks/[id]/move/route");
    const res = await POST(
      new Request(`http://x/api/tasks/${taskId}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kanbanStageId: seed.kanbanStageIds.inProgress,
          newIndex: 0,
          // No assigneeId in body
        }),
      }),
      { params: Promise.resolve({ id: taskId }) },
    );
    expect(res.status).toBe(200);
    const after = await prisma.task.findUniqueOrThrow({
      where: { id: taskId },
      select: { assigneeId: true },
    });
    expect(after.assigneeId).toBe(seed.adminId);
  });

  it("rejects assigneeId belonging to a different workspace (workspace isolation)", async () => {
    // Seed a second workspace with its own admin user. The /move endpoint
    // should NOT accept that user's id as an assignee for a task in workspace #1.
    // Without the workspaceId filter on the membership lookup, a stranger from
    // another tenant could be silently assigned tasks they don't belong to.
    const ws2 = await prisma.workspace.create({ data: { name: "OtherWS" } });
    const ws2Admin = await prisma.user.create({
      data: { workspaceId: ws2.id, email: "stranger@other.local", role: "ADMIN", name: "Stranger" },
    });

    const { POST } = await import("@/app/api/tasks/[id]/move/route");
    const res = await POST(
      new Request(`http://localhost/api/tasks/${taskId}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kanbanStageId: seed.kanbanStageIds.inProgress,
          newIndex: 0,
          assigneeId: ws2Admin.id,
        }),
      }),
      { params: Promise.resolve({ id: taskId }) },
    );
    expect(res.status).toBe(404);

    // Confirm the original task was not mutated.
    const after = await prisma.task.findUniqueOrThrow({
      where: { id: taskId },
      select: { assigneeId: true, kanbanStageId: true },
    });
    expect(after.assigneeId).not.toBe(ws2Admin.id);
    expect(after.kanbanStageId).toBe(seed.kanbanStageIds.backlog);
  });
});
