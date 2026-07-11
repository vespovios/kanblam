import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { setupTestWorkspace, type SeededWorkspace } from "@/tests/integration/helpers/workspace";
import { createTask, listTasks, getTask, updateTask, deleteTask } from "@/lib/tasks/service";

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

function minimalTask(overrides: Record<string, unknown> = {}) {
  return {
    projectId,
    name: "My task",
    priorityId: seed.priorityIds.medium,
    kanbanStageId: seed.kanbanStageIds.backlog,
    ...overrides,
  };
}

describe("createTask", () => {
  it("creates a task in the workspace", async () => {
    const t = await createTask(seed.workspaceId, minimalTask());
    expect(t?.name).toBe("My task");
    expect(t?.workspaceId).toBe(seed.workspaceId);
  });

  it("returns null when project is in another workspace", async () => {
    const other = await prisma.workspace.create({ data: { name: "O" } });
    const oStatus = await prisma.status.create({ data: { workspaceId: other.id, name: "s", color: "#ccc", order: 1 } });
    const oProject = await prisma.project.create({
      data: { workspaceId: other.id, name: "x", code: "P01", statusId: oStatus.id },
    });
    const t = await createTask(seed.workspaceId, minimalTask({ projectId: oProject.id }));
    expect(t).toBeNull();
  });
});

describe("listTasks", () => {
  it("returns workspace's tasks with optional filters", async () => {
    await createTask(seed.workspaceId, minimalTask({ name: "A" }));
    await createTask(seed.workspaceId, minimalTask({ name: "B", assigneeId: seed.memberId }));

    const all = await listTasks(seed.workspaceId, {});
    expect(all).toHaveLength(2);

    const filtered = await listTasks(seed.workspaceId, { assigneeId: seed.memberId });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe("B");
  });

  it("hideCompleted filters tasks in any terminal stage out", async () => {
    const project = await prisma.project.create({
      data: {
        workspaceId: seed.workspaceId,
        name: "P",
        code: "P1",
        statusId: seed.statusIds.notStarted,
      },
    });
    // Task in non-terminal stage (Backlog) → should be included
    await prisma.task.create({
      data: {
        workspaceId: seed.workspaceId,
        projectId: project.id,
        name: "open",
        priorityId: seed.priorityIds.medium,
        kanbanStageId: seed.kanbanStageIds.backlog,
      },
    });
    // Task in terminal stage (Done) → should be filtered out
    await prisma.task.create({
      data: {
        workspaceId: seed.workspaceId,
        projectId: project.id,
        name: "closed",
        priorityId: seed.priorityIds.medium,
        kanbanStageId: seed.kanbanStageIds.done,
      },
    });

    const tasks = await listTasks(seed.workspaceId, { hideCompleted: true });
    const names = tasks.map((t) => t.name);
    expect(names).toContain("open");
    expect(names).not.toContain("closed");
  });

  it("filters by projectId", async () => {
    const p2 = await prisma.project.create({
      data: { workspaceId: seed.workspaceId, name: "P2", code: "P02", statusId: seed.statusIds.notStarted },
    });
    await createTask(seed.workspaceId, minimalTask({ name: "A" }));
    await createTask(seed.workspaceId, minimalTask({ name: "B", projectId: p2.id }));

    const res = await listTasks(seed.workspaceId, { projectId: p2.id });
    expect(res).toHaveLength(1);
    expect(res[0].name).toBe("B");
  });
});

describe("getTask", () => {
  it("returns task with relations", async () => {
    const t = await createTask(seed.workspaceId, minimalTask());
    const got = await getTask(seed.workspaceId, t!.id);
    expect(got?.id).toBe(t!.id);
  });

  it("returns null for cross-workspace", async () => {
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
    expect(await getTask(seed.workspaceId, oTask.id)).toBeNull();
  });
});

describe("updateTask", () => {
  it("updates a field", async () => {
    const t = await createTask(seed.workspaceId, minimalTask());
    const up = await updateTask(seed.workspaceId, t!.id, { name: "Renamed" });
    expect(up?.name).toBe("Renamed");
  });
});

describe("deleteTask", () => {
  it("deletes a task", async () => {
    const t = await createTask(seed.workspaceId, minimalTask());
    const ok = await deleteTask(seed.workspaceId, t!.id);
    expect(ok).toBe(true);
    expect(await prisma.task.findUnique({ where: { id: t!.id } })).toBeNull();
  });
});

describe("tag attachment via task service", () => {
  it("createTask connects tagIds and returns tags in the result", async () => {
    const tag1 = await prisma.tag.create({
      data: { workspaceId: seed.workspaceId, name: "alpha", color: "#fce7e7" },
    });
    const tag2 = await prisma.tag.create({
      data: { workspaceId: seed.workspaceId, name: "beta", color: "#fcedc7" },
    });
    const t = await createTask(seed.workspaceId, {
      projectId,
      name: "T1",
      priorityId: seed.priorityIds.medium,
      kanbanStageId: seed.kanbanStageIds.backlog,
      tagIds: [tag1.id, tag2.id],
    });
    expect(t!.tags.map((x) => x.name).sort()).toEqual(["alpha", "beta"]);
  });

  it("updateTask with tagIds REPLACES the tag set (not merges)", async () => {
    const tag1 = await prisma.tag.create({
      data: { workspaceId: seed.workspaceId, name: "a", color: "#fce7e7" },
    });
    const tag2 = await prisma.tag.create({
      data: { workspaceId: seed.workspaceId, name: "b", color: "#fcedc7" },
    });
    const tag3 = await prisma.tag.create({
      data: { workspaceId: seed.workspaceId, name: "c", color: "#dcf3dc" },
    });
    const t = await createTask(seed.workspaceId, {
      projectId,
      name: "T1",
      priorityId: seed.priorityIds.medium,
      kanbanStageId: seed.kanbanStageIds.backlog,
      tagIds: [tag1.id, tag2.id],
    });
    const updated = await updateTask(seed.workspaceId, t!.id, { tagIds: [tag3.id] });
    expect(updated!.tags.map((x) => x.name)).toEqual(["c"]);
  });

  it("listTasks with tagIds filters with OR semantics", async () => {
    const tagA = await prisma.tag.create({
      data: { workspaceId: seed.workspaceId, name: "A", color: "#fce7e7" },
    });
    const tagB = await prisma.tag.create({
      data: { workspaceId: seed.workspaceId, name: "B", color: "#fcedc7" },
    });
    const tagC = await prisma.tag.create({
      data: { workspaceId: seed.workspaceId, name: "C", color: "#dcf3dc" },
    });
    const baseInput = {
      projectId,
      priorityId: seed.priorityIds.medium,
      kanbanStageId: seed.kanbanStageIds.backlog,
    };
    const t1 = await createTask(seed.workspaceId, { ...baseInput, name: "T1", tagIds: [tagA.id] });
    const t2 = await createTask(seed.workspaceId, { ...baseInput, name: "T2", tagIds: [tagB.id] });
    const t3 = await createTask(seed.workspaceId, { ...baseInput, name: "T3", tagIds: [tagC.id] });

    const filtered = await listTasks(seed.workspaceId, { tagIds: [tagA.id, tagB.id] });
    const names = filtered.map((x) => x.name).sort();
    expect(names).toEqual(["T1", "T2"]);
    // T3 (only tagged C) excluded.
    expect(names).not.toContain("T3");
    // Sanity: also verify all three tasks exist when no filter.
    const all = await listTasks(seed.workspaceId, {});
    expect(all.length).toBe(3);
    // Suppress unused warning
    void t1; void t2; void t3;
  });

  it("listTasks with empty tagIds array returns all tasks (no filter applied)", async () => {
    await createTask(seed.workspaceId, {
      projectId,
      name: "T1",
      priorityId: seed.priorityIds.medium,
      kanbanStageId: seed.kanbanStageIds.backlog,
    });
    const all = await listTasks(seed.workspaceId, { tagIds: [] });
    expect(all.length).toBe(1);
  });

  it("createTask rejects tag IDs from another workspace", async () => {
    const otherWs = await prisma.workspace.create({ data: { name: "OtherWS" } });
    const foreignTag = await prisma.tag.create({
      data: { workspaceId: otherWs.id, name: "smuggled", color: "#fce7e7" },
    });
    await expect(
      createTask(seed.workspaceId, {
        projectId,
        name: "T1",
        priorityId: seed.priorityIds.medium,
        kanbanStageId: seed.kanbanStageIds.backlog,
        tagIds: [foreignTag.id],
      }),
    ).rejects.toThrow(/not in workspace/i);
  });

  it("updateTask rejects tag IDs from another workspace", async () => {
    const otherWs = await prisma.workspace.create({ data: { name: "OtherWS" } });
    const foreignTag = await prisma.tag.create({
      data: { workspaceId: otherWs.id, name: "smuggled", color: "#fce7e7" },
    });
    const t = await createTask(seed.workspaceId, {
      projectId,
      name: "T1",
      priorityId: seed.priorityIds.medium,
      kanbanStageId: seed.kanbanStageIds.backlog,
    });
    await expect(
      updateTask(seed.workspaceId, t!.id, { tagIds: [foreignTag.id] }),
    ).rejects.toThrow(/not in workspace/i);
  });
});
