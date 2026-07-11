import { prisma } from "@/lib/db";
import {
  nextOccurrences,
  generationWindowEnd,
  type RecurrenceRule,
} from "./next-occurrences";
import type { CreateRecurringTaskInput, UpdateRecurringTaskInput } from "@/lib/validators/recurring-task";
import { assertTagsInWorkspace } from "@/lib/tags/service";
import { notifyWorkspace } from "@/lib/realtime/notify";

/** Always surface at least this many upcoming instances, regardless of how
 *  far apart the rule's occurrences are. Keeps quarterly / yearly series
 *  from looking empty while bounding daily series to the day-window. */
const MIN_OCCURRENCES_AHEAD = 5;

const TEMPLATE_INCLUDE = {
  project: { select: { id: true, name: true, code: true } },
  priority: { select: { id: true, name: true, color: true } },
  kanbanStage: { select: { id: true, name: true, color: true } },
  assignee: { select: { id: true, name: true, email: true } },
  tags: { select: { id: true, name: true, color: true } },
  subtaskTemplates: {
    select: { id: true, title: true, position: true },
    orderBy: { position: "asc" } as const,
  },
} as const;

function isoToUtcDate(s: string): Date {
  return new Date(s + "T00:00:00.000Z");
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export async function listTemplates(workspaceId: string) {
  return prisma.recurringTaskTemplate.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    include: TEMPLATE_INCLUDE,
  });
}

export async function getTemplate(workspaceId: string, id: string) {
  return prisma.recurringTaskTemplate.findFirst({
    where: { id, workspaceId },
    include: TEMPLATE_INCLUDE,
  });
}

export async function createTemplate(
  workspaceId: string,
  createdById: string,
  input: CreateRecurringTaskInput,
) {
  // Verify project belongs to workspace.
  const project = await prisma.project.findFirst({
    where: { id: input.projectId, workspaceId },
    select: { id: true },
  });
  if (!project) return null;

  if (input.tagIds && input.tagIds.length > 0) {
    await assertTagsInWorkspace(workspaceId, input.tagIds);
  }

  return prisma.$transaction(async (tx) => {
    const template = await tx.recurringTaskTemplate.create({
      data: {
        workspaceId,
        createdById,
        name: input.name,
        description: input.description,
        projectId: input.projectId,
        priorityId: input.priorityId,
        kanbanStageId: input.kanbanStageId,
        assigneeId: input.assigneeId ?? null,
        isImportant: input.isImportant ?? false,
        isUrgent: input.isUrgent ?? false,
        frequency: input.frequency,
        interval: input.interval,
        daysOfWeek: input.frequency === "WEEKLY" ? input.daysOfWeek : [],
        startDate: isoToUtcDate(input.startDate),
        endDate: input.endDate ? isoToUtcDate(input.endDate) : null,
        tags: input.tagIds && input.tagIds.length > 0
          ? { connect: input.tagIds.map((id) => ({ id })) }
          : undefined,
      },
    });

    if (input.subtaskTemplates && input.subtaskTemplates.length > 0) {
      await tx.subtaskTemplate.createMany({
        data: input.subtaskTemplates.map((s, i) => ({
          recurringTemplateId: template.id,
          title: s.title,
          position: i,
        })),
      });
    }

    return tx.recurringTaskTemplate.findUnique({
      where: { id: template.id },
      include: TEMPLATE_INCLUDE,
    });
  });
}

export async function updateTemplate(
  workspaceId: string,
  id: string,
  input: UpdateRecurringTaskInput,
) {
  const existing = await prisma.recurringTaskTemplate.findFirst({
    where: { id, workspaceId },
    select: { id: true },
  });
  if (!existing) return null;

  const data: Record<string, unknown> = {};
  for (const key of [
    "name",
    "description",
    "projectId",
    "priorityId",
    "kanbanStageId",
    "assigneeId",
    "isImportant",
    "isUrgent",
    "frequency",
    "interval",
    "daysOfWeek",
    "isActive",
  ] as const) {
    if (input[key] !== undefined) data[key] = input[key];
  }
  if (input.startDate !== undefined) data.startDate = isoToUtcDate(input.startDate);
  if (input.endDate !== undefined) data.endDate = input.endDate ? isoToUtcDate(input.endDate) : null;
  if (input.tagIds !== undefined) {
    if (input.tagIds.length > 0) {
      await assertTagsInWorkspace(workspaceId, input.tagIds);
    }
    data.tags = { set: input.tagIds.map((id) => ({ id })) };
  }

  // Normalize: daysOfWeek only meaningful when frequency is (or is being changed to) WEEKLY.
  // We need to know the EFFECTIVE frequency after this update (input value if provided, existing value otherwise).
  if (input.daysOfWeek !== undefined) {
    // Determine the effective frequency post-update.
    const effectiveFrequency = input.frequency ?? (await prisma.recurringTaskTemplate.findUnique({
      where: { id },
      select: { frequency: true },
    }))?.frequency;
    if (effectiveFrequency !== "WEEKLY") {
      data.daysOfWeek = [];
    }
  }
  // Also: if frequency itself is being changed away from WEEKLY (and daysOfWeek wasn't sent), clear it.
  if (input.frequency !== undefined && input.frequency !== "WEEKLY" && input.daysOfWeek === undefined) {
    data.daysOfWeek = [];
  }

  const subtaskTemplatesPayload = input.subtaskTemplates;

  return prisma.$transaction(async (tx) => {
    if (subtaskTemplatesPayload !== undefined) {
      const existing = await tx.subtaskTemplate.findMany({
        where: { recurringTemplateId: id },
        select: { id: true },
      });
      const existingIds = new Set(existing.map((e) => e.id));
      const incomingIds = new Set(
        subtaskTemplatesPayload.map((s) => s.id).filter((x): x is string => x !== undefined),
      );

      // Delete existing items not present in the incoming payload.
      const toDelete = [...existingIds].filter((eid) => !incomingIds.has(eid));
      if (toDelete.length > 0) {
        await tx.subtaskTemplate.deleteMany({ where: { id: { in: toDelete } } });
      }

      // Walk the incoming array and update positions + create new items.
      for (let i = 0; i < subtaskTemplatesPayload.length; i++) {
        const item = subtaskTemplatesPayload[i];
        if (item.id && existingIds.has(item.id)) {
          await tx.subtaskTemplate.update({
            where: { id: item.id },
            data: { title: item.title, position: i },
          });
        } else {
          await tx.subtaskTemplate.create({
            data: {
              recurringTemplateId: id,
              title: item.title,
              position: i,
            },
          });
        }
      }
    }

    return tx.recurringTaskTemplate.update({
      where: { id },
      data,
      include: TEMPLATE_INCLUDE,
    });
  });
}

export async function deleteTemplate(workspaceId: string, id: string): Promise<boolean> {
  const res = await prisma.recurringTaskTemplate.deleteMany({ where: { id, workspaceId } });
  return res.count > 0;
}

/**
 * Generate Task rows for occurrences of `templateId` that aren't already
 * represented by an existing Task for this template.
 *
 * The window runs from the rolling high-water mark
 * (`lastGeneratedDate + 1d`, or `template.startDate` first time) up to
 * `generationWindowEnd` — `max(today + lookAheadDays, the Nth upcoming
 * occurrence)`. The occurrence-count floor is what keeps a quarterly or
 * yearly series from looking empty past a flat day-window.
 *
 * Returns the number of newly created tasks.
 */
export async function generateInstances(
  workspaceId: string,
  templateId: string,
  now: Date,
  lookAheadDays: number,
): Promise<number> {
  const template = await prisma.recurringTaskTemplate.findFirst({
    where: { id: templateId, workspaceId, isActive: true },
    include: {
      tags: { select: { id: true } },
      subtaskTemplates: {
        select: { title: true, position: true },
        orderBy: { position: "asc" },
      },
    },
  });
  if (!template) return 0;

  const rule: RecurrenceRule = {
    frequency: template.frequency as RecurrenceRule["frequency"],
    interval: template.interval,
    daysOfWeek: template.daysOfWeek,
    startDate: template.startDate,
    endDate: template.endDate,
  };

  // `from` is the rolling high-water mark (don't regenerate what's already
  // there). `to` is anchored on today and bounded by occurrence COUNT, not
  // a flat day count — so a quarterly/yearly series still materialises its
  // next handful instead of looking empty past a 30-day window.
  const from = template.lastGeneratedDate
    ? new Date(template.lastGeneratedDate.getTime() + 24 * 60 * 60 * 1000)
    : startOfUtcDay(template.startDate);
  const to = generationWindowEnd(rule, now, lookAheadDays, MIN_OCCURRENCES_AHEAD);

  const candidateDates = nextOccurrences(rule, from, to);
  if (candidateDates.length === 0) return 0;

  // Find dates that already have a generated Task to avoid duplicates.
  const existing = await prisma.task.findMany({
    where: {
      recurringTemplateId: template.id,
      dueDate: { gte: from, lte: to },
    },
    select: { dueDate: true },
  });
  const existingKeys = new Set(
    existing.map((t) => (t.dueDate ? t.dueDate.toISOString().slice(0, 10) : "")),
  );

  const toCreate = candidateDates.filter((d) => !existingKeys.has(d.toISOString().slice(0, 10)));
  if (toCreate.length === 0) return 0;

  // Find the next kanban order so new tasks land at the bottom of their stage.
  const last = await prisma.task.findFirst({
    where: { workspaceId, kanbanStageId: template.kanbanStageId },
    orderBy: { kanbanOrder: "desc" },
    select: { kanbanOrder: true },
  });
  let nextOrder = (last?.kanbanOrder ?? 0) + 1;

  await prisma.$transaction(async (tx) => {
    for (const occ of toCreate) {
      const createdTask = await tx.task.create({
        data: {
          workspaceId,
          projectId: template.projectId,
          name: template.name,
          description: template.description,
          isImportant: template.isImportant,
          isUrgent: template.isUrgent,
          priorityId: template.priorityId,
          kanbanStageId: template.kanbanStageId,
          assigneeId: template.assigneeId,
          dueDate: occ,
          kanbanOrder: nextOrder++,
          recurringTemplateId: template.id,
          tags: template.tags.length > 0
            ? { connect: template.tags.map((t) => ({ id: t.id })) }
            : undefined,
        },
      });

      if (template.subtaskTemplates.length > 0) {
        await tx.subtask.createMany({
          data: template.subtaskTemplates.map((st) => ({
            taskId: createdTask.id,
            title: st.title,
            completed: false,
            position: st.position,
          })),
        });
      }
    }
    await tx.recurringTaskTemplate.update({
      where: { id: template.id },
      data: { lastGeneratedDate: toCreate[toCreate.length - 1] },
    });
  });

  if (toCreate.length > 0) {
    await notifyWorkspace(workspaceId, "tasks");
  }
  return toCreate.length;
}

export async function generateInstancesForWorkspace(
  workspaceId: string,
  now: Date,
  lookAheadDays: number,
): Promise<number> {
  const templates = await prisma.recurringTaskTemplate.findMany({
    where: { workspaceId, isActive: true },
    select: { id: true },
  });
  let total = 0;
  for (const t of templates) {
    try {
      total += await generateInstances(workspaceId, t.id, now, lookAheadDays);
    } catch (e) {
      console.error("generateInstances failed", { workspaceId, templateId: t.id, error: e instanceof Error ? e.message : String(e) });
      // continue with the next template
    }
  }
  return total;
}
