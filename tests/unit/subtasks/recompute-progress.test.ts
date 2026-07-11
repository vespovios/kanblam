import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { setupTestWorkspace, type SeededWorkspace } from "@/tests/integration/helpers/workspace";
import { recomputeTaskProgress } from "@/lib/subtasks/recompute-progress";

const prisma = new PrismaClient();
let seed: SeededWorkspace;
let projectId: string;

beforeEach(async () => {
  seed = await setupTestWorkspace(prisma);
  const project = await prisma.project.create({
    data: { workspaceId: seed.workspaceId, name: "P", code: "P1", statusId: seed.statusIds.notStarted },
  });
  projectId = project.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function makeTask(progressManual = false, progressPct = 0) {
  return prisma.task.create({
    data: {
      workspaceId: seed.workspaceId,
      projectId,
      name: "T",
      priorityId: seed.priorityIds.medium,
      kanbanStageId: seed.kanbanStageIds.backlog,
      progressManual,
      progressPct,
    },
  });
}

async function addSubtasks(taskId: string, items: { completed: boolean }[]) {
  for (let i = 0; i < items.length; i++) {
    await prisma.subtask.create({
      data: { taskId, title: `s${i}`, completed: items[i].completed, position: i },
    });
  }
}

describe("recomputeTaskProgress", () => {
  it("sets progress to 0 when no subtasks completed", async () => {
    const task = await makeTask();
    await addSubtasks(task.id, [{ completed: false }, { completed: false }, { completed: false }]);
    await prisma.$transaction((tx) => recomputeTaskProgress(tx, task.id));
    const updated = await prisma.task.findUnique({ where: { id: task.id } });
    expect(updated!.progressPct).toBe(0);
  });

  it("sets progress to 100 when all subtasks completed", async () => {
    const task = await makeTask();
    await addSubtasks(task.id, [{ completed: true }, { completed: true }, { completed: true }]);
    await prisma.$transaction((tx) => recomputeTaskProgress(tx, task.id));
    const updated = await prisma.task.findUnique({ where: { id: task.id } });
    expect(updated!.progressPct).toBe(100);
  });

  it("rounds correctly: 1/3 -> 33", async () => {
    const task = await makeTask();
    await addSubtasks(task.id, [{ completed: true }, { completed: false }, { completed: false }]);
    await prisma.$transaction((tx) => recomputeTaskProgress(tx, task.id));
    const updated = await prisma.task.findUnique({ where: { id: task.id } });
    expect(updated!.progressPct).toBe(33);
  });

  it("rounds correctly: 2/3 -> 67", async () => {
    const task = await makeTask();
    await addSubtasks(task.id, [{ completed: true }, { completed: true }, { completed: false }]);
    await prisma.$transaction((tx) => recomputeTaskProgress(tx, task.id));
    const updated = await prisma.task.findUnique({ where: { id: task.id } });
    expect(updated!.progressPct).toBe(67);
  });

  it("is a no-op when progressManual is true", async () => {
    const task = await makeTask(/* manual */ true, /* progressPct */ 75);
    await addSubtasks(task.id, [{ completed: true }, { completed: false }]);
    await prisma.$transaction((tx) => recomputeTaskProgress(tx, task.id));
    const updated = await prisma.task.findUnique({ where: { id: task.id } });
    expect(updated!.progressPct).toBe(75); // unchanged
  });

  it("is a no-op when there are zero subtasks", async () => {
    const task = await makeTask(/* manual */ false, /* progressPct */ 42);
    await prisma.$transaction((tx) => recomputeTaskProgress(tx, task.id));
    const updated = await prisma.task.findUnique({ where: { id: task.id } });
    expect(updated!.progressPct).toBe(42); // unchanged
  });

  it("returns silently if the task does not exist", async () => {
    await expect(
      prisma.$transaction((tx) => recomputeTaskProgress(tx, "nonexistent-id")),
    ).resolves.toBeUndefined();
  });
});
