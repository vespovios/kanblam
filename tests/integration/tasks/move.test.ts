import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { setupTestWorkspace, type SeededWorkspace } from "@/tests/integration/helpers/workspace";
import { createTask, moveTask } from "@/lib/tasks/service";

const prisma = new PrismaClient();
let seed: SeededWorkspace;
let projectId: string;

beforeEach(async () => {
  seed = await setupTestWorkspace(prisma);
  const p = await prisma.project.create({
    data: { workspaceId: seed.workspaceId, name: "P", code: "P01", statusId: seed.statusIds.notStarted },
  });
  projectId = p.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

function mk(overrides: Record<string, unknown> = {}) {
  return {
    projectId,
    name: "T",
    priorityId: seed.priorityIds.medium,
    kanbanStageId: seed.kanbanStageIds.backlog,
    ...overrides,
  };
}

describe("moveTask", () => {
  it("moves a task to a different stage, appending at end", async () => {
    const a = await createTask(seed.workspaceId, mk({ name: "A" }));
    const b = await createTask(seed.workspaceId, mk({ name: "B" }));
    await createTask(seed.workspaceId, mk({ name: "X", kanbanStageId: seed.kanbanStageIds.inProgress }));

    const moved = await moveTask(seed.workspaceId, a!.id, {
      kanbanStageId: seed.kanbanStageIds.inProgress,
    });

    expect(moved?.kanbanStageId).toBe(seed.kanbanStageIds.inProgress);
    const inProgress = await prisma.task.findMany({
      where: { workspaceId: seed.workspaceId, kanbanStageId: seed.kanbanStageIds.inProgress },
      orderBy: { kanbanOrder: "asc" },
      select: { name: true, kanbanOrder: true },
    });
    expect(inProgress.map((t) => t.name)).toEqual(["X", "A"]);
    expect(inProgress.map((t) => t.kanbanOrder)).toEqual([1, 2]);

    const backlog = await prisma.task.findMany({
      where: { workspaceId: seed.workspaceId, kanbanStageId: seed.kanbanStageIds.backlog },
      select: { name: true },
    });
    expect(backlog.map((t) => t.name)).toEqual(["B"]);
  });

  it("inserts at specified newIndex within destination stage", async () => {
    await createTask(seed.workspaceId, mk({ name: "X", kanbanStageId: seed.kanbanStageIds.inProgress }));
    await createTask(seed.workspaceId, mk({ name: "Y", kanbanStageId: seed.kanbanStageIds.inProgress }));
    const moving = await createTask(seed.workspaceId, mk({ name: "A" }));

    await moveTask(seed.workspaceId, moving!.id, {
      kanbanStageId: seed.kanbanStageIds.inProgress,
      newIndex: 1,
    });

    const rows = await prisma.task.findMany({
      where: { workspaceId: seed.workspaceId, kanbanStageId: seed.kanbanStageIds.inProgress },
      orderBy: { kanbanOrder: "asc" },
      select: { name: true },
    });
    expect(rows.map((r) => r.name)).toEqual(["X", "A", "Y"]);
  });

  it("reorders within the same stage when newIndex is given", async () => {
    const x = await createTask(seed.workspaceId, mk({ name: "X" }));
    await createTask(seed.workspaceId, mk({ name: "Y" }));
    await createTask(seed.workspaceId, mk({ name: "Z" }));

    await moveTask(seed.workspaceId, x!.id, {
      kanbanStageId: seed.kanbanStageIds.backlog,
      newIndex: 2,
    });

    const rows = await prisma.task.findMany({
      where: { workspaceId: seed.workspaceId, kanbanStageId: seed.kanbanStageIds.backlog },
      orderBy: { kanbanOrder: "asc" },
      select: { name: true },
    });
    expect(rows.map((r) => r.name)).toEqual(["Y", "Z", "X"]);
  });

  it("returns null for cross-workspace tasks", async () => {
    const other = await prisma.workspace.create({ data: { name: "O" } });
    const oStatus = await prisma.status.create({ data: { workspaceId: other.id, name: "s", color: "#ccc", order: 1 } });
    const oPrio = await prisma.priority.create({ data: { workspaceId: other.id, name: "p", color: "#ccc", order: 1 } });
    const oKanban = await prisma.kanbanStage.create({ data: { workspaceId: other.id, name: "k", color: "#ccc", order: 1 } });
    const oProject = await prisma.project.create({
      data: { workspaceId: other.id, name: "x", code: "P01", statusId: oStatus.id },
    });
    const oTask = await prisma.task.create({
      data: {
        workspaceId: other.id,
        projectId: oProject.id,
        name: "t",
        priorityId: oPrio.id,
        kanbanStageId: oKanban.id,
      },
    });
    const res = await moveTask(seed.workspaceId, oTask.id, {
      kanbanStageId: seed.kanbanStageIds.inProgress,
    });
    expect(res).toBeNull();
  });

  it("returns null when destination stage is in another workspace", async () => {
    const a = await createTask(seed.workspaceId, mk({ name: "A" }));
    const other = await prisma.workspace.create({ data: { name: "O" } });
    const oKanban = await prisma.kanbanStage.create({
      data: { workspaceId: other.id, name: "k", color: "#ccc", order: 1 },
    });
    const res = await moveTask(seed.workspaceId, a!.id, { kanbanStageId: oKanban.id });
    expect(res).toBeNull();
  });

  it("clamps newIndex above the array length to the end", async () => {
    await createTask(seed.workspaceId, mk({ name: "X", kanbanStageId: seed.kanbanStageIds.inProgress }));
    const moving = await createTask(seed.workspaceId, mk({ name: "A" }));

    await moveTask(seed.workspaceId, moving!.id, {
      kanbanStageId: seed.kanbanStageIds.inProgress,
      newIndex: 999,
    });

    const rows = await prisma.task.findMany({
      where: { workspaceId: seed.workspaceId, kanbanStageId: seed.kanbanStageIds.inProgress },
      orderBy: { kanbanOrder: "asc" },
      select: { name: true },
    });
    expect(rows.map((r) => r.name)).toEqual(["X", "A"]);
  });
});
