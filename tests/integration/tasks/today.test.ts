import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { setupTestWorkspace, type SeededWorkspace } from "@/tests/integration/helpers/workspace";
import { listTodayBuckets } from "@/lib/tasks/today";

const prisma = new PrismaClient();
let seed: SeededWorkspace;
let projectId: string;

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const NOW = utc(2026, 4, 29); // Wed Apr 29 2026 UTC midnight
const YESTERDAY = utc(2026, 4, 28);
const TWO_DAYS_AGO = utc(2026, 4, 27);
const TOMORROW = utc(2026, 4, 30);

beforeEach(async () => {
  seed = await setupTestWorkspace(prisma);
  const project = await prisma.project.create({
    data: {
      workspaceId: seed.workspaceId,
      name: "Web App",
      code: "WEB",
      statusId: seed.statusIds.notStarted,
    },
    select: { id: true },
  });
  projectId = project.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function makeTask(overrides: {
  name: string;
  dueDate?: Date | null;
  isImportant?: boolean;
  isUrgent?: boolean;
  kanbanStageId?: string;
  priorityId?: string;
}) {
  return prisma.task.create({
    data: {
      workspaceId: seed.workspaceId,
      projectId,
      name: overrides.name,
      dueDate: overrides.dueDate ?? null,
      isImportant: overrides.isImportant ?? false,
      isUrgent: overrides.isUrgent ?? false,
      priorityId: overrides.priorityId ?? seed.priorityIds.medium,
      kanbanStageId: overrides.kanbanStageId ?? seed.kanbanStageIds.backlog,
    },
    select: { id: true, name: true },
  });
}

describe("listTodayBuckets", () => {
  it("returns three empty buckets for an empty workspace", async () => {
    const r = await listTodayBuckets(seed.workspaceId, NOW, { workingToday: true });
    expect(r.overdue).toEqual([]);
    expect(r.dueToday).toEqual([]);
    expect(r.q1).toEqual([]);
  });

  it("places an overdue task in overdue and nowhere else", async () => {
    const t = await makeTask({ name: "old", dueDate: YESTERDAY });
    const r = await listTodayBuckets(seed.workspaceId, NOW, { workingToday: true });
    expect(r.overdue.map((x) => x.id)).toEqual([t.id]);
    expect(r.dueToday).toEqual([]);
    expect(r.q1).toEqual([]);
  });

  it("places a due-today task in dueToday and nowhere else", async () => {
    const t = await makeTask({ name: "today", dueDate: NOW });
    const r = await listTodayBuckets(seed.workspaceId, NOW, { workingToday: true });
    expect(r.overdue).toEqual([]);
    expect(r.dueToday.map((x) => x.id)).toEqual([t.id]);
    expect(r.q1).toEqual([]);
  });

  it("places a Q1 task with no due date in q1", async () => {
    const t = await makeTask({ name: "q1-undated", isImportant: true, isUrgent: true });
    const r = await listTodayBuckets(seed.workspaceId, NOW, { workingToday: true });
    expect(r.q1.map((x) => x.id)).toEqual([t.id]);
    expect(r.overdue).toEqual([]);
    expect(r.dueToday).toEqual([]);
  });

  it("places a Q1 task due tomorrow in q1 (not dueToday)", async () => {
    const t = await makeTask({
      name: "q1-tomorrow",
      isImportant: true,
      isUrgent: true,
      dueDate: TOMORROW,
    });
    const r = await listTodayBuckets(seed.workspaceId, NOW, { workingToday: true });
    expect(r.q1.map((x) => x.id)).toEqual([t.id]);
    expect(r.overdue).toEqual([]);
    expect(r.dueToday).toEqual([]);
  });

  it("MUTUAL EXCLUSIVITY: an overdue Q1 task appears in overdue ONLY", async () => {
    const t = await makeTask({
      name: "overdue-q1",
      dueDate: YESTERDAY,
      isImportant: true,
      isUrgent: true,
    });
    const r = await listTodayBuckets(seed.workspaceId, NOW, { workingToday: true });
    expect(r.overdue.map((x) => x.id)).toEqual([t.id]);
    expect(r.q1.map((x) => x.id)).toEqual([]);
  });

  it("MUTUAL EXCLUSIVITY: a due-today Q1 task appears in dueToday ONLY", async () => {
    const t = await makeTask({
      name: "due-today-q1",
      dueDate: NOW,
      isImportant: true,
      isUrgent: true,
    });
    const r = await listTodayBuckets(seed.workspaceId, NOW, { workingToday: true });
    expect(r.dueToday.map((x) => x.id)).toEqual([t.id]);
    expect(r.q1.map((x) => x.id)).toEqual([]);
  });

  it("excludes terminal-stage tasks from all three buckets", async () => {
    await makeTask({
      name: "done-overdue",
      dueDate: YESTERDAY,
      kanbanStageId: seed.kanbanStageIds.done,
    });
    await makeTask({
      name: "done-today",
      dueDate: NOW,
      kanbanStageId: seed.kanbanStageIds.done,
    });
    await makeTask({
      name: "done-q1",
      isImportant: true,
      isUrgent: true,
      kanbanStageId: seed.kanbanStageIds.done,
    });
    const r = await listTodayBuckets(seed.workspaceId, NOW, { workingToday: true });
    expect(r.overdue).toEqual([]);
    expect(r.dueToday).toEqual([]);
    expect(r.q1).toEqual([]);
  });

  it("on non-working day: overdue + dueToday empty, q1 still populated", async () => {
    await makeTask({ name: "old", dueDate: YESTERDAY });
    await makeTask({ name: "today", dueDate: NOW });
    const q1 = await makeTask({
      name: "q1",
      isImportant: true,
      isUrgent: true,
    });
    const r = await listTodayBuckets(seed.workspaceId, NOW, { workingToday: false });
    expect(r.overdue).toEqual([]);
    expect(r.dueToday).toEqual([]);
    expect(r.q1.map((x) => x.id)).toEqual([q1.id]);
  });

  it("overdue sort: earliest dueDate first", async () => {
    const newer = await makeTask({ name: "newer", dueDate: YESTERDAY });
    const older = await makeTask({ name: "older", dueDate: TWO_DAYS_AGO });
    const r = await listTodayBuckets(seed.workspaceId, NOW, { workingToday: true });
    expect(r.overdue.map((x) => x.id)).toEqual([older.id, newer.id]);
  });

  it("dueToday sort: highest priority (lowest order) first", async () => {
    const lowP = await makeTask({
      name: "low",
      dueDate: NOW,
      priorityId: seed.priorityIds.low,
    });
    const highP = await makeTask({
      name: "high",
      dueDate: NOW,
      priorityId: seed.priorityIds.high,
    });
    const r = await listTodayBuckets(seed.workspaceId, NOW, { workingToday: true });
    expect(r.dueToday.map((x) => x.id)).toEqual([highP.id, lowP.id]);
  });

  it("q1 sort: dated tasks before undated; among dated, earliest first", async () => {
    const undated = await makeTask({
      name: "no-date",
      isImportant: true,
      isUrgent: true,
    });
    const dueLater = await makeTask({
      name: "later",
      isImportant: true,
      isUrgent: true,
      dueDate: utc(2026, 5, 10),
    });
    const dueSoon = await makeTask({
      name: "soon",
      isImportant: true,
      isUrgent: true,
      dueDate: TOMORROW,
    });
    const r = await listTodayBuckets(seed.workspaceId, NOW, { workingToday: true });
    expect(r.q1.map((x) => x.id)).toEqual([dueSoon.id, dueLater.id, undated.id]);
  });
});
