import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { setupTestWorkspace, type SeededWorkspace } from "@/tests/integration/helpers/workspace";
import {
  listSubtasks,
  createSubtask,
  updateSubtask,
  deleteSubtask,
  reorderSubtasks,
} from "@/lib/subtasks/service";

const prisma = new PrismaClient();
let seed: SeededWorkspace;
let projectId: string;
let taskId: string;

beforeEach(async () => {
  seed = await setupTestWorkspace(prisma);
  const project = await prisma.project.create({
    data: { workspaceId: seed.workspaceId, name: "P", code: "P1", statusId: seed.statusIds.notStarted },
  });
  projectId = project.id;
  const task = await prisma.task.create({
    data: {
      workspaceId: seed.workspaceId,
      projectId,
      name: "T",
      priorityId: seed.priorityIds.medium,
      kanbanStageId: seed.kanbanStageIds.backlog,
    },
  });
  taskId = task.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("createSubtask", () => {
  it("creates with title at next position (0 for first)", async () => {
    const s = await createSubtask(seed.workspaceId, taskId, { title: "First" });
    expect(s).not.toBeNull();
    expect(s!.title).toBe("First");
    expect(s!.completed).toBe(false);
    expect(s!.position).toBe(0);
  });

  it("appends at end of existing list", async () => {
    await createSubtask(seed.workspaceId, taskId, { title: "a" });
    await createSubtask(seed.workspaceId, taskId, { title: "b" });
    const c = await createSubtask(seed.workspaceId, taskId, { title: "c" });
    expect(c!.position).toBe(2);
  });

  it("returns null when task is in another workspace", async () => {
    const other = await prisma.workspace.create({ data: { name: "Other" } });
    const result = await createSubtask(other.id, taskId, { title: "x" });
    expect(result).toBeNull();
  });

  it("rejects at the 101st subtask", async () => {
    for (let i = 0; i < 100; i++) {
      await createSubtask(seed.workspaceId, taskId, { title: `s${i}` });
    }
    await expect(
      createSubtask(seed.workspaceId, taskId, { title: "overflow" }),
    ).rejects.toThrow(/Maximum 100 subtasks/i);
  });

  it("triggers progress recompute when task is in auto mode", async () => {
    await createSubtask(seed.workspaceId, taskId, { title: "a" });
    const before = await prisma.task.findUnique({ where: { id: taskId } });
    expect(before!.progressPct).toBe(0); // 0/1 = 0
    // Now mark first complete and add a new one — recompute on the new add should hit
    await prisma.subtask.updateMany({ where: { taskId }, data: { completed: true } });
    await createSubtask(seed.workspaceId, taskId, { title: "b" });
    const after = await prisma.task.findUnique({ where: { id: taskId } });
    expect(after!.progressPct).toBe(50); // 1 complete / 2 total
  });
});

describe("listSubtasks", () => {
  it("returns subtasks ordered by position", async () => {
    await createSubtask(seed.workspaceId, taskId, { title: "first" });
    await createSubtask(seed.workspaceId, taskId, { title: "second" });
    await createSubtask(seed.workspaceId, taskId, { title: "third" });
    const list = await listSubtasks(seed.workspaceId, taskId);
    expect(list).not.toBeNull();
    expect(list!.map((s) => s.title)).toEqual(["first", "second", "third"]);
  });

  it("returns null when task is in another workspace", async () => {
    const other = await prisma.workspace.create({ data: { name: "Other" } });
    const result = await listSubtasks(other.id, taskId);
    expect(result).toBeNull();
  });
});

describe("updateSubtask", () => {
  it("updates title only", async () => {
    const s = await createSubtask(seed.workspaceId, taskId, { title: "original" });
    const updated = await updateSubtask(seed.workspaceId, s!.id, { title: "renamed" });
    expect(updated!.title).toBe("renamed");
    expect(updated!.completed).toBe(false);
  });

  it("toggles completed and triggers recompute (auto mode)", async () => {
    const s1 = await createSubtask(seed.workspaceId, taskId, { title: "a" });
    await createSubtask(seed.workspaceId, taskId, { title: "b" });
    await updateSubtask(seed.workspaceId, s1!.id, { completed: true });
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    expect(task!.progressPct).toBe(50);
  });

  it("does NOT trigger recompute when parent is in manual mode", async () => {
    await prisma.task.update({ where: { id: taskId }, data: { progressManual: true, progressPct: 75 } });
    const s1 = await createSubtask(seed.workspaceId, taskId, { title: "a" });
    await createSubtask(seed.workspaceId, taskId, { title: "b" });
    await updateSubtask(seed.workspaceId, s1!.id, { completed: true });
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    expect(task!.progressPct).toBe(75); // unchanged
  });

  it("returns null when subtask is in another workspace", async () => {
    const s = await createSubtask(seed.workspaceId, taskId, { title: "x" });
    const other = await prisma.workspace.create({ data: { name: "Other" } });
    const result = await updateSubtask(other.id, s!.id, { title: "hijacked" });
    expect(result).toBeNull();
    const fresh = await prisma.subtask.findUnique({ where: { id: s!.id } });
    expect(fresh!.title).toBe("x"); // unchanged
  });
});

describe("deleteSubtask", () => {
  it("deletes and triggers recompute", async () => {
    const s1 = await createSubtask(seed.workspaceId, taskId, { title: "a" });
    const s2 = await createSubtask(seed.workspaceId, taskId, { title: "b" });
    await updateSubtask(seed.workspaceId, s1!.id, { completed: true });
    // Now: 1/2 complete -> 50%. Delete the incomplete one -> 1/1 -> 100%.
    const ok = await deleteSubtask(seed.workspaceId, s2!.id);
    expect(ok).toBe(true);
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    expect(task!.progressPct).toBe(100);
  });

  it("returns false when subtask is in another workspace", async () => {
    const s = await createSubtask(seed.workspaceId, taskId, { title: "x" });
    const other = await prisma.workspace.create({ data: { name: "Other" } });
    const ok = await deleteSubtask(other.id, s!.id);
    expect(ok).toBe(false);
    const fresh = await prisma.subtask.findUnique({ where: { id: s!.id } });
    expect(fresh).not.toBeNull();
  });
});

describe("reorderSubtasks", () => {
  it("rewrites positions atomically", async () => {
    const a = await createSubtask(seed.workspaceId, taskId, { title: "A" });
    const b = await createSubtask(seed.workspaceId, taskId, { title: "B" });
    const c = await createSubtask(seed.workspaceId, taskId, { title: "C" });
    const ok = await reorderSubtasks(seed.workspaceId, taskId, [c!.id, a!.id, b!.id]);
    expect(ok).toBe(true);
    const list = await listSubtasks(seed.workspaceId, taskId);
    expect(list!.map((s) => s.title)).toEqual(["C", "A", "B"]);
    expect(list!.map((s) => s.position)).toEqual([0, 1, 2]);
  });

  it("rejects when ordered set does not match existing", async () => {
    const a = await createSubtask(seed.workspaceId, taskId, { title: "A" });
    const b = await createSubtask(seed.workspaceId, taskId, { title: "B" });
    // Missing c, present a + b
    await expect(reorderSubtasks(seed.workspaceId, taskId, [a!.id])).rejects.toThrow(
      /set mismatch/i,
    );
    // Extra unknown id
    await expect(
      reorderSubtasks(seed.workspaceId, taskId, [a!.id, b!.id, "fake-id"]),
    ).rejects.toThrow(/set mismatch/i);
  });

  it("returns false when task is in another workspace", async () => {
    const a = await createSubtask(seed.workspaceId, taskId, { title: "A" });
    const other = await prisma.workspace.create({ data: { name: "Other" } });
    const ok = await reorderSubtasks(other.id, taskId, [a!.id]);
    expect(ok).toBe(false);
  });
});

describe("cascade", () => {
  it("subtasks delete with parent task", async () => {
    await createSubtask(seed.workspaceId, taskId, { title: "x" });
    await createSubtask(seed.workspaceId, taskId, { title: "y" });
    await prisma.task.delete({ where: { id: taskId } });
    const remaining = await prisma.subtask.findMany({ where: { taskId } });
    expect(remaining).toEqual([]);
  });
});
