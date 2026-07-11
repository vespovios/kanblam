import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { TASK_INCLUDE } from "./service";

export type TodayTaskRow = Prisma.TaskGetPayload<{ include: typeof TASK_INCLUDE }>;

export interface TodayBuckets {
  overdue: TodayTaskRow[];
  dueToday: TodayTaskRow[];
  q1: TodayTaskRow[];
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export async function listTodayBuckets(
  workspaceId: string,
  now: Date,
  opts: { workingToday: boolean },
): Promise<TodayBuckets> {
  const startOfToday = startOfUtcDay(now);
  const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

  const baseWhere = {
    workspaceId,
    kanbanStage: { isTerminal: false },
  } as const;

  // Date-bound buckets only run on working days. q1 always runs.
  const [overdue, dueToday] = opts.workingToday
    ? await Promise.all([
        prisma.task.findMany({
          where: { ...baseWhere, dueDate: { lt: startOfToday } },
          include: TASK_INCLUDE,
          orderBy: { dueDate: "asc" },
        }),
        prisma.task.findMany({
          where: {
            ...baseWhere,
            dueDate: { gte: startOfToday, lt: startOfTomorrow },
          },
          include: TASK_INCLUDE,
          orderBy: { priority: { order: "asc" } },
        }),
      ])
    : [[], []];

  const excludeIds = [...overdue.map((t) => t.id), ...dueToday.map((t) => t.id)];

  const q1 = await prisma.task.findMany({
    where: {
      ...baseWhere,
      isImportant: true,
      isUrgent: true,
      ...(excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}),
    },
    include: TASK_INCLUDE,
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
  });

  return { overdue, dueToday, q1 };
}
