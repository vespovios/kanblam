import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
import { Client as PgClient } from "pg";
import { PrismaClient } from "@prisma/client";
import { setupTestWorkspace, type SeededWorkspace } from "@/tests/integration/helpers/workspace";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";

const prisma = new PrismaClient();
let seed: SeededWorkspace;
let projectId: string;
let listenClient: PgClient;
const received: { workspaceId: string; kind: string }[] = [];

beforeEach(async () => {
  received.length = 0;
  seed = await setupTestWorkspace(prisma);
  const p = await prisma.project.create({
    data: { workspaceId: seed.workspaceId, name: "P", code: "P01", statusId: seed.statusIds.notStarted },
  });
  projectId = p.id;
  vi.mocked(auth).mockResolvedValue({
    user: { id: seed.adminId, email: "admin@test.local", workspaceId: seed.workspaceId, role: "ADMIN" },
    expires: new Date(Date.now() + 86400_000).toISOString(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  listenClient = new PgClient({ connectionString: process.env.DATABASE_URL });
  await listenClient.connect();
  await listenClient.query("LISTEN workspace_changes");
  listenClient.on("notification", (msg) => {
    if (msg.channel === "workspace_changes" && msg.payload) {
      received.push(JSON.parse(msg.payload));
    }
  });
});

afterEach(async () => {
  if (listenClient) await listenClient.end();
});

afterAll(async () => {
  await prisma.$disconnect();
});

// Wait briefly for NOTIFY delivery (in-process pg bus is fast but async).
const flush = () => new Promise((r) => setTimeout(r, 50));

describe("notifyWorkspace fires from mutation routes", () => {
  it("POST /api/tasks emits {kind: 'tasks'}", async () => {
    const { POST } = await import("@/app/api/tasks/route");
    const res = await POST(
      new Request("http://x/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          name: "T",
          priorityId: seed.priorityIds.medium,
          kanbanStageId: seed.kanbanStageIds.backlog,
        }),
      }),
    );
    expect(res.status).toBe(201);
    await flush();
    const ours = received.filter((e) => e.workspaceId === seed.workspaceId);
    expect(ours).toContainEqual({ workspaceId: seed.workspaceId, kind: "tasks" });
  });

  it("POST /api/projects emits {kind: 'projects'}", async () => {
    const { POST } = await import("@/app/api/projects/route");
    const res = await POST(
      new Request("http://x/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "X", code: "X01", statusId: seed.statusIds.notStarted }),
      }),
    );
    expect(res.status).toBe(201);
    await flush();
    const ours = received.filter((e) => e.workspaceId === seed.workspaceId);
    expect(ours).toContainEqual({ workspaceId: seed.workspaceId, kind: "projects" });
  });

  it("POST /api/tags emits {kind: 'tags'}", async () => {
    const { POST } = await import("@/app/api/tags/route");
    const res = await POST(
      new Request("http://x/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "design", color: "#aabbcc" }),
      }),
    );
    expect(res.status).toBe(201);
    await flush();
    const ours = received.filter((e) => e.workspaceId === seed.workspaceId);
    expect(ours).toContainEqual({ workspaceId: seed.workspaceId, kind: "tags" });
  });

  it("does NOT emit when the surrounding transaction rolls back", async () => {
    // Wrap a notify in a deliberately-failing transaction; the NOTIFY must
    // not be delivered. This is a built-in Postgres guarantee we depend on.
    const before = received.length;
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `NOTIFY workspace_changes, '{"workspaceId":"${seed.workspaceId}","kind":"tasks"}'`,
        );
        throw new Error("forced rollback");
      });
    } catch {
      /* expected */
    }
    await flush();
    expect(received.length).toBe(before);
  });
});
