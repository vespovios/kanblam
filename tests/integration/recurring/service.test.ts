import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { setupTestWorkspace, type SeededWorkspace } from "@/tests/integration/helpers/workspace";
import {
  createTemplate,
  listTemplates,
  getTemplate,
  updateTemplate,
  deleteTemplate,
  generateInstances,
  generateInstancesForWorkspace,
} from "@/lib/recurring/service";

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

function baseInput() {
  return {
    name: "Standup",
    description: undefined,
    projectId,
    priorityId: seed.priorityIds.medium,
    kanbanStageId: seed.kanbanStageIds.backlog,
    assigneeId: null,
    isImportant: false,
    isUrgent: false,
    frequency: "DAILY" as const,
    interval: 1,
    daysOfWeek: [],
    startDate: "2026-04-20",
    endDate: null,
  };
}

describe("recurring template CRUD", () => {
  it("creates a template scoped to the workspace", async () => {
    const t = await createTemplate(seed.workspaceId, seed.adminId, baseInput());
    expect(t).not.toBeNull();
    expect(t!.workspaceId).toBe(seed.workspaceId);
    expect(t!.createdById).toBe(seed.adminId);
    expect(t!.frequency).toBe("DAILY");
  });

  it("lists templates scoped to workspace, newest first", async () => {
    await createTemplate(seed.workspaceId, seed.adminId, baseInput());
    await createTemplate(seed.workspaceId, seed.adminId, { ...baseInput(), name: "Second" });
    const list = await listTemplates(seed.workspaceId);
    expect(list).toHaveLength(2);
    expect(list[0].name).toBe("Second");
  });

  it("getTemplate returns null for cross-workspace id", async () => {
    const other = await prisma.workspace.create({ data: { name: "Other" } });
    const oStatus = await prisma.status.create({ data: { workspaceId: other.id, name: "s", color: "#000", order: 1 } });
    const oPrio = await prisma.priority.create({ data: { workspaceId: other.id, name: "p", color: "#000", order: 1 } });
    const oStage = await prisma.kanbanStage.create({ data: { workspaceId: other.id, name: "k", color: "#000", order: 1 } });
    const oUser = await prisma.user.create({ data: { workspaceId: other.id, email: "o@o", role: "ADMIN" } });
    const oProj = await prisma.project.create({ data: { workspaceId: other.id, name: "X", code: "X01", statusId: oStatus.id } });
    const oTpl = await prisma.recurringTaskTemplate.create({
      data: {
        workspaceId: other.id,
        name: "Other",
        projectId: oProj.id,
        priorityId: oPrio.id,
        kanbanStageId: oStage.id,
        createdById: oUser.id,
        frequency: "DAILY",
        interval: 1,
        daysOfWeek: [],
        startDate: new Date("2026-04-20T00:00:00Z"),
      },
    });
    expect(await getTemplate(seed.workspaceId, oTpl.id)).toBeNull();
  });

  it("updates a template's interval", async () => {
    const t = await createTemplate(seed.workspaceId, seed.adminId, baseInput());
    const updated = await updateTemplate(seed.workspaceId, t!.id, { interval: 3 });
    expect(updated?.interval).toBe(3);
  });

  it("normalizes daysOfWeek to [] for non-WEEKLY frequencies on create", async () => {
    const t = await createTemplate(seed.workspaceId, seed.adminId, {
      ...baseInput(),
      frequency: "DAILY",
      daysOfWeek: [1, 3, 5], // bogus for DAILY
    });
    expect(t!.daysOfWeek).toEqual([]);
  });

  it("clears daysOfWeek when frequency changes away from WEEKLY on update", async () => {
    const t = await createTemplate(seed.workspaceId, seed.adminId, {
      ...baseInput(),
      frequency: "WEEKLY",
      daysOfWeek: [1, 3, 5],
    });
    expect(t!.daysOfWeek).toEqual([1, 3, 5]);

    const updated = await updateTemplate(seed.workspaceId, t!.id, { frequency: "DAILY" });
    expect(updated!.daysOfWeek).toEqual([]);
  });

  it("deletes a template (and tasks survive with null FK)", async () => {
    const t = await createTemplate(seed.workspaceId, seed.adminId, baseInput());
    await generateInstances(seed.workspaceId, t!.id, new Date("2026-04-22T00:00:00Z"), 1);
    const before = await prisma.task.findMany({
      where: { workspaceId: seed.workspaceId, recurringTemplateId: t!.id },
    });
    expect(before.length).toBeGreaterThan(0);

    expect(await deleteTemplate(seed.workspaceId, t!.id)).toBe(true);
    const after = await prisma.task.findMany({
      where: { workspaceId: seed.workspaceId, name: "Standup" },
    });
    expect(after.length).toBe(before.length);
    expect(after.every((t) => t.recurringTemplateId === null)).toBe(true);
  });
});

describe("generateInstances", () => {
  it("creates Task rows for each occurrence in the lookahead window", async () => {
    const t = await createTemplate(seed.workspaceId, seed.adminId, baseInput());
    // baseInput startDate is 2026-04-20. now=2026-04-22, lookAhead=3.
    // The window end is max(now+lookAhead, 5th upcoming occurrence): dayBound
    // is 2026-04-25, but the 5th occurrence from now (04-22,23,24,25,26) is
    // 2026-04-26, so the window runs [2026-04-20, 2026-04-26] = 7 days.
    const created = await generateInstances(
      seed.workspaceId,
      t!.id,
      new Date("2026-04-22T12:00:00Z"),
      3,
    );
    expect(created).toBe(7); // 2026-04-20..26 inclusive = 7 days

    const tasks = await prisma.task.findMany({
      where: { recurringTemplateId: t!.id },
      orderBy: { dueDate: "asc" },
      select: { dueDate: true, name: true },
    });
    expect(tasks).toHaveLength(7);
    expect(tasks[0].name).toBe("Standup");
    expect(tasks[0].dueDate?.toISOString().slice(0, 10)).toBe("2026-04-20");
    expect(tasks[6].dueDate?.toISOString().slice(0, 10)).toBe("2026-04-26");
  });

  it("is idempotent — running twice with same window does not duplicate", async () => {
    const t = await createTemplate(seed.workspaceId, seed.adminId, baseInput());
    await generateInstances(seed.workspaceId, t!.id, new Date("2026-04-22T12:00:00Z"), 3);
    const second = await generateInstances(seed.workspaceId, t!.id, new Date("2026-04-22T12:00:00Z"), 3);
    expect(second).toBe(0);
    const count = await prisma.task.count({ where: { recurringTemplateId: t!.id } });
    expect(count).toBe(7);
  });

  it("skips inactive templates", async () => {
    const t = await createTemplate(seed.workspaceId, seed.adminId, baseInput());
    await updateTemplate(seed.workspaceId, t!.id, { isActive: false });
    const created = await generateInstances(seed.workspaceId, t!.id, new Date("2026-04-22T12:00:00Z"), 3);
    expect(created).toBe(0);
  });
});

describe("generateInstancesForWorkspace", () => {
  it("aggregates across all active templates and returns total count", async () => {
    const t1 = await createTemplate(seed.workspaceId, seed.adminId, baseInput());
    const t2 = await createTemplate(seed.workspaceId, seed.adminId, { ...baseInput(), name: "Other" });
    await updateTemplate(seed.workspaceId, t1!.id, { isActive: false });

    const total = await generateInstancesForWorkspace(seed.workspaceId, new Date("2026-04-22T12:00:00Z"), 1);
    // Only t2 is active. lookAhead=1 → dayBound 2026-04-23, but the 5th upcoming
    // occurrence (04-22,23,24,25,26) pushes the window to 2026-04-26, so
    // backfilling from startDate gives 2026-04-20..26 = 7 days.
    expect(total).toBe(7);
  });
});

describe("generateInstances tag propagation", () => {
  it("copies template tags to each newly-generated Task", async () => {
    const tagA = await prisma.tag.create({
      data: { workspaceId: seed.workspaceId, name: "routine", color: "#fce7e7" },
    });
    const tagB = await prisma.tag.create({
      data: { workspaceId: seed.workspaceId, name: "daily", color: "#fcedc7" },
    });
    const t = await createTemplate(seed.workspaceId, seed.adminId, {
      ...baseInput(),
      tagIds: [tagA.id, tagB.id],
    });
    const created = await generateInstances(
      seed.workspaceId,
      t!.id,
      new Date("2026-04-22T12:00:00Z"),
      1,
    );
    expect(created).toBeGreaterThan(0);
    const tasks = await prisma.task.findMany({
      where: { recurringTemplateId: t!.id },
      include: { tags: true },
    });
    for (const task of tasks) {
      expect(task.tags.map((x) => x.name).sort()).toEqual(["daily", "routine"]);
    }
  });
});

describe("workspace-scope guard on tagIds", () => {
  it("createTemplate rejects tag IDs from another workspace", async () => {
    const otherWs = await prisma.workspace.create({ data: { name: "OtherWS" } });
    const foreignTag = await prisma.tag.create({
      data: { workspaceId: otherWs.id, name: "smuggled", color: "#fce7e7" },
    });
    await expect(
      createTemplate(seed.workspaceId, seed.adminId, {
        ...baseInput(),
        tagIds: [foreignTag.id],
      }),
    ).rejects.toThrow(/not in workspace/i);
  });

  it("updateTemplate rejects tag IDs from another workspace", async () => {
    const otherWs = await prisma.workspace.create({ data: { name: "OtherWS" } });
    const foreignTag = await prisma.tag.create({
      data: { workspaceId: otherWs.id, name: "smuggled", color: "#fce7e7" },
    });
    const t = await createTemplate(seed.workspaceId, seed.adminId, baseInput());
    await expect(
      updateTemplate(seed.workspaceId, t!.id, { tagIds: [foreignTag.id] }),
    ).rejects.toThrow(/not in workspace/i);
  });
});
