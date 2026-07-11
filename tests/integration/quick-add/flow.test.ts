import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { setupTestWorkspace, type SeededWorkspace } from "@/tests/integration/helpers/workspace";
import { parseQuickAdd } from "@/lib/quick-add/parse";
import { resolveQuickAdd, type ResolveContext } from "@/lib/quick-add/resolve";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";

const prisma = new PrismaClient();
let seed: SeededWorkspace;
let projectWeb: { id: string; code: string };

beforeEach(async () => {
  seed = await setupTestWorkspace(prisma);

  // Seed two projects so the smart-default fallback has something to fall back to.
  projectWeb = await prisma.project.create({
    data: {
      workspaceId: seed.workspaceId,
      name: "Web App",
      code: "WEB",
      statusId: seed.statusIds.notStarted,
    },
    select: { id: true, code: true },
  });

  // Pre-existing tag to test the "match existing" branch alongside auto-create.
  await prisma.tag.create({
    data: { workspaceId: seed.workspaceId, name: "auth", color: "#fcd9d4" },
  });

  vi.mocked(auth).mockResolvedValue({
    user: {
      id: seed.adminId,
      email: "admin@test.local",
      workspaceId: seed.workspaceId,
      role: "ADMIN",
    },
    expires: new Date(Date.now() + 86400_000).toISOString(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("quick-add end-to-end flow", () => {
  it("parses, resolves, auto-creates new tags, and POSTs the task", async () => {
    // 1. Snapshot the workspace data the way the palette would receive it.
    const [projects, tags, members, priorities] = await Promise.all([
      prisma.project.findMany({
        where: { workspaceId: seed.workspaceId },
        select: { id: true, code: true },
      }),
      prisma.tag.findMany({
        where: { workspaceId: seed.workspaceId },
        select: { id: true, name: true },
      }),
      prisma.user.findMany({
        where: { workspaceId: seed.workspaceId },
        select: { id: true, name: true, email: true },
      }),
      prisma.priority.findMany({
        where: { workspaceId: seed.workspaceId },
        select: { id: true, name: true },
      }),
    ]);

    // 2. Parse and resolve.
    const parsed = parseQuickAdd(
      "Fix login redirect [WEB] #auth #brand-new due:fri @admin !urgent",
    );
    expect(parsed.errors).toEqual([]);

    const ctx: ResolveContext = {
      projects,
      tags,
      members,
      priorities,
      defaultProjectId: projectWeb.id,
      defaultPriorityId: seed.priorityIds.medium,
      defaultKanbanStageId: seed.kanbanStageIds.backlog,
      currentUserId: seed.adminId,
      now: new Date(Date.UTC(2026, 3, 29)), // Wed Apr 29
    };
    const resolved = resolveQuickAdd(parsed, ctx);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) throw new Error("resolve failed");

    expect(resolved.autoCreateTagNames).toEqual(["brand-new"]);

    // 3. Auto-create the unknown tag via the real route handler.
    const { POST: postTag } = await import("@/app/api/tags/route");
    const tagRes = await postTag(
      new Request("http://localhost/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "brand-new" }),
      }),
    );
    expect(tagRes.status).toBe(201);
    const { tag: createdTag } = await tagRes.json();

    // 4. POST the task.
    const { POST: postTask } = await import("@/app/api/tasks/route");
    const taskRes = await postTask(
      new Request("http://localhost/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...resolved.payload,
          tagIds: [...(resolved.payload.tagIds ?? []), createdTag.id],
        }),
      }),
    );
    expect(taskRes.status).toBe(201);
    const { task } = await taskRes.json();

    // 5. Assert the persisted row.
    const persisted = await prisma.task.findUnique({
      where: { id: task.id },
      include: { tags: { select: { name: true } }, assignee: true },
    });
    expect(persisted).not.toBeNull();
    expect(persisted!.name).toBe("Fix login redirect");
    expect(persisted!.projectId).toBe(projectWeb.id);
    expect(persisted!.kanbanStageId).toBe(seed.kanbanStageIds.backlog);
    expect(persisted!.priorityId).toBe(seed.priorityIds.medium);
    expect(persisted!.isUrgent).toBe(true);
    expect(persisted!.isImportant).toBe(false);
    expect(persisted!.assigneeId).toBe(seed.adminId);
    expect(persisted!.dueDate?.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(persisted!.tags.map((t) => t.name).sort()).toEqual(["auth", "brand-new"]);

    // 6. Assert the new tag now exists in the workspace.
    const tagCount = await prisma.tag.count({
      where: { workspaceId: seed.workspaceId, name: "brand-new" },
    });
    expect(tagCount).toBe(1);
  });
});
