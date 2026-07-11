import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { setupTestWorkspace, type SeededWorkspace } from "@/tests/integration/helpers/workspace";

const prisma = new PrismaClient();
let seed: SeededWorkspace;
let projectId: string;

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

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

describe("calendar page OR-overlap query (mirror of page.tsx logic)", () => {
  it("includes a multi-day task whose startDate is in window but dueDate is outside", async () => {
    const winFrom = utc(2026, 4, 20);
    const winToExclusive = utc(2026, 4, 27);

    const t = await prisma.task.create({
      data: {
        workspaceId: seed.workspaceId,
        projectId,
        name: "spans-out",
        priorityId: seed.priorityIds.medium,
        kanbanStageId: seed.kanbanStageIds.backlog,
        startDate: utc(2026, 4, 22),
        dueDate: utc(2026, 5, 4),
      },
    });

    const found = await prisma.task.findMany({
      where: {
        workspaceId: seed.workspaceId,
        OR: [
          { startDate: { lt: winToExclusive }, dueDate: { gte: winFrom } },
          { startDate: { gte: winFrom, lt: winToExclusive }, dueDate: null },
          { dueDate: { gte: winFrom, lt: winToExclusive }, startDate: null },
        ],
      },
      select: { id: true },
    });

    expect(found.map((x) => x.id)).toContain(t.id);
  });

  it("includes a start-only task whose startDate is in window", async () => {
    const winFrom = utc(2026, 4, 20);
    const winToExclusive = utc(2026, 4, 27);
    const t = await prisma.task.create({
      data: {
        workspaceId: seed.workspaceId,
        projectId,
        name: "start-only",
        priorityId: seed.priorityIds.medium,
        kanbanStageId: seed.kanbanStageIds.backlog,
        startDate: utc(2026, 4, 23),
        dueDate: null,
      },
    });

    const found = await prisma.task.findMany({
      where: {
        workspaceId: seed.workspaceId,
        OR: [
          { startDate: { lt: winToExclusive }, dueDate: { gte: winFrom } },
          { startDate: { gte: winFrom, lt: winToExclusive }, dueDate: null },
          { dueDate: { gte: winFrom, lt: winToExclusive }, startDate: null },
        ],
      },
      select: { id: true },
    });

    expect(found.map((x) => x.id)).toContain(t.id);
  });

  it("excludes a task entirely outside the window", async () => {
    const winFrom = utc(2026, 4, 20);
    const winToExclusive = utc(2026, 4, 27);
    const t = await prisma.task.create({
      data: {
        workspaceId: seed.workspaceId,
        projectId,
        name: "outside",
        priorityId: seed.priorityIds.medium,
        kanbanStageId: seed.kanbanStageIds.backlog,
        startDate: utc(2026, 5, 1),
        dueDate: utc(2026, 5, 3),
      },
    });

    const found = await prisma.task.findMany({
      where: {
        workspaceId: seed.workspaceId,
        OR: [
          { startDate: { lt: winToExclusive }, dueDate: { gte: winFrom } },
          { startDate: { gte: winFrom, lt: winToExclusive }, dueDate: null },
          { dueDate: { gte: winFrom, lt: winToExclusive }, startDate: null },
        ],
      },
      select: { id: true },
    });

    expect(found.map((x) => x.id)).not.toContain(t.id);
  });
});
