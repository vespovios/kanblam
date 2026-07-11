import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { setupTestWorkspace, type SeededWorkspace } from "@/tests/integration/helpers/workspace";
import { createTask, updateTask } from "@/lib/tasks/service";
import { createTemplate, updateTemplate, generateInstances } from "@/lib/recurring/service";

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

function baseInput() {
  return {
    projectId,
    name: "T",
    priorityId: seed.priorityIds.medium,
    kanbanStageId: seed.kanbanStageIds.backlog,
  };
}

describe("createTask with subtasks", () => {
  it("creates with provided subtasks in order, all unchecked", async () => {
    const task = await createTask(seed.workspaceId, {
      ...baseInput(),
      subtasks: [{ title: "first" }, { title: "second" }, { title: "third" }],
    });
    expect(task).not.toBeNull();
    const subs = await prisma.subtask.findMany({
      where: { taskId: task!.id },
      orderBy: { position: "asc" },
    });
    expect(subs.map((s) => s.title)).toEqual(["first", "second", "third"]);
    expect(subs.every((s) => !s.completed)).toBe(true);
    expect(subs.map((s) => s.position)).toEqual([0, 1, 2]);
    expect(task!.progressPct).toBe(0); // 0/3
  });

  it("ignores empty subtasks array", async () => {
    const task = await createTask(seed.workspaceId, { ...baseInput(), subtasks: [] });
    const subs = await prisma.subtask.findMany({ where: { taskId: task!.id } });
    expect(subs).toEqual([]);
  });
});

describe("updateTask progressManual transitions", () => {
  it("flipping manual->auto immediately recomputes from subtasks", async () => {
    const task = await createTask(seed.workspaceId, baseInput());
    // Set up: manual mode at 75%, two subtasks (one done).
    await prisma.task.update({ where: { id: task!.id }, data: { progressManual: true, progressPct: 75 } });
    await prisma.subtask.create({ data: { taskId: task!.id, title: "a", completed: true, position: 0 } });
    await prisma.subtask.create({ data: { taskId: task!.id, title: "b", completed: false, position: 1 } });

    // Flip to auto.
    const updated = await updateTask(seed.workspaceId, task!.id, { progressManual: false });
    expect(updated!.progressManual).toBe(false);
    expect(updated!.progressPct).toBe(50); // 1/2 = 50
  });

  it("flipping auto->manual leaves progressPct as-is", async () => {
    const task = await createTask(seed.workspaceId, baseInput());
    // Set up: auto mode, two subtasks (one done) -> recompute would have set 50%.
    await prisma.subtask.create({ data: { taskId: task!.id, title: "a", completed: true, position: 0 } });
    await prisma.subtask.create({ data: { taskId: task!.id, title: "b", completed: false, position: 1 } });
    await prisma.task.update({ where: { id: task!.id }, data: { progressPct: 50 } });

    const updated = await updateTask(seed.workspaceId, task!.id, { progressManual: true });
    expect(updated!.progressManual).toBe(true);
    expect(updated!.progressPct).toBe(50); // unchanged
  });

  it("setting progressManual to its current value is a no-op", async () => {
    const task = await createTask(seed.workspaceId, baseInput());
    await prisma.task.update({ where: { id: task!.id }, data: { progressPct: 33 } });
    // Already false; flipping false->false should not recompute.
    const updated = await updateTask(seed.workspaceId, task!.id, { progressManual: false });
    expect(updated!.progressPct).toBe(33);
  });
});

describe("listTasks shape with subtasks", () => {
  it("includes subtask data on each task", async () => {
    const task = await createTask(seed.workspaceId, {
      ...baseInput(),
      subtasks: [{ title: "a" }, { title: "b" }],
    });
    const { listTasks } = await import("@/lib/tasks/service");
    const list = await listTasks(seed.workspaceId, {});
    const found = list.find((t) => t.id === task!.id);
    expect(found).toBeDefined();
    // The included `subtasks` array carries id/title/completed/position; cards
    // and tables compute their own caption from these.
    expect(Array.isArray((found as { subtasks: unknown[] }).subtasks)).toBe(true);
    expect((found as { subtasks: unknown[] }).subtasks).toHaveLength(2);
  });
});

describe("Recurring template subtaskTemplates", () => {
  function templateInput() {
    return {
      name: "Recur",
      projectId,
      priorityId: seed.priorityIds.medium,
      kanbanStageId: seed.kanbanStageIds.backlog,
      frequency: "DAILY" as const,
      interval: 1,
      daysOfWeek: [],
      startDate: new Date().toISOString().slice(0, 10),
    };
  }

  it("creates a template with subtask templates in order", async () => {
    const t = await createTemplate(seed.workspaceId, seed.adminId, {
      ...templateInput(),
      subtaskTemplates: [{ title: "first" }, { title: "second" }, { title: "third" }],
    });
    expect(t).not.toBeNull();
    const sts = await prisma.subtaskTemplate.findMany({
      where: { recurringTemplateId: t!.id },
      orderBy: { position: "asc" },
    });
    expect(sts.map((s) => s.title)).toEqual(["first", "second", "third"]);
  });

  it("updateTemplate reconciles: existing-id updates title, missing creates, absent-id deletes", async () => {
    const t = await createTemplate(seed.workspaceId, seed.adminId, {
      ...templateInput(),
      subtaskTemplates: [{ title: "keep" }, { title: "rename" }, { title: "drop" }],
    });
    const initial = await prisma.subtaskTemplate.findMany({
      where: { recurringTemplateId: t!.id },
      orderBy: { position: "asc" },
    });
    const keepId = initial[0].id;
    const renameId = initial[1].id;

    await updateTemplate(seed.workspaceId, t!.id, {
      subtaskTemplates: [
        { id: keepId, title: "keep" },
        { id: renameId, title: "renamed!" },
        { title: "new" },
      ],
    });

    const after = await prisma.subtaskTemplate.findMany({
      where: { recurringTemplateId: t!.id },
      orderBy: { position: "asc" },
    });
    expect(after.map((s) => s.title)).toEqual(["keep", "renamed!", "new"]);
    // The third initial item ("drop") was removed.
    expect(after.find((s) => s.title === "drop")).toBeUndefined();
  });

  it("clears all subtaskTemplates when payload is empty array", async () => {
    const t = await createTemplate(seed.workspaceId, seed.adminId, {
      ...templateInput(),
      subtaskTemplates: [{ title: "a" }, { title: "b" }, { title: "c" }],
    });
    const before = await prisma.subtaskTemplate.findMany({
      where: { recurringTemplateId: t!.id },
    });
    expect(before).toHaveLength(3);

    await updateTemplate(seed.workspaceId, t!.id, {
      subtaskTemplates: [],
    });

    const after = await prisma.subtaskTemplate.findMany({
      where: { recurringTemplateId: t!.id },
    });
    expect(after).toEqual([]);
  });

  it("generateInstances deep-copies subtask templates into fresh unchecked subtasks", async () => {
    const t = await createTemplate(seed.workspaceId, seed.adminId, {
      ...templateInput(),
      subtaskTemplates: [{ title: "milk" }, { title: "bread" }, { title: "eggs" }],
    });
    const created = await generateInstances(
      seed.workspaceId,
      t!.id,
      new Date(Date.UTC(2026, 4, 28)),
      0,
    );
    expect(created).toBeGreaterThan(0);
    const tasks = await prisma.task.findMany({
      where: { recurringTemplateId: t!.id },
      include: { subtasks: { orderBy: { position: "asc" } } },
    });
    for (const task of tasks) {
      expect(task.subtasks.map((s) => s.title)).toEqual(["milk", "bread", "eggs"]);
      expect(task.subtasks.every((s) => !s.completed)).toBe(true);
      expect(task.progressPct).toBe(0);
      expect(task.progressManual).toBe(false);
    }
  });

  it("templateUpdate of subtaskTemplates does NOT affect already-generated tasks' subtasks", async () => {
    const t = await createTemplate(seed.workspaceId, seed.adminId, {
      ...templateInput(),
      subtaskTemplates: [{ title: "milk" }],
    });
    await generateInstances(seed.workspaceId, t!.id, new Date(Date.UTC(2026, 4, 28)), 0);
    // Rename the template item.
    const stsBefore = await prisma.subtaskTemplate.findMany({ where: { recurringTemplateId: t!.id } });
    await updateTemplate(seed.workspaceId, t!.id, {
      subtaskTemplates: [{ id: stsBefore[0].id, title: "milk (organic)" }],
    });
    // Already-generated task subtasks unchanged.
    const tasks = await prisma.task.findMany({ where: { recurringTemplateId: t!.id }, include: { subtasks: true } });
    for (const task of tasks) {
      expect(task.subtasks.map((s) => s.title)).toEqual(["milk"]);
    }
  });
});
