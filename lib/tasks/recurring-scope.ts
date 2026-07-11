import { prisma } from "@/lib/db";
import { generateInstances } from "@/lib/recurring/service";
import { assertTagsInWorkspace } from "@/lib/tags/service";

/**
 * Scoped edit / delete for recurring task instances — the Google-Calendar
 * "this task / this and following / all tasks" model.
 *
 * "this" scope is NOT handled here: the API route edits / deletes the single
 * Task row via the normal updateTask / deleteTask path (the generation
 * high-water mark means a deleted instance never regenerates). This module
 * owns only the two *series*-level scopes.
 */

export type RecurrenceScope = "this" | "following" | "all";

/** Blueprint fields shared between a task and its recurring template — the
 *  subset the edit drawer can change that's meaningful at the series level. */
export interface SeriesBlueprintInput {
  name?: string;
  description?: string | null;
  priorityId?: string;
  kanbanStageId?: string;
  assigneeId?: string | null;
  tagIds?: string[];
  isImportant?: boolean;
  isUrgent?: boolean;
}

/** The recurrence rule, as the RecurrenceFields component emits it. */
export interface SeriesRecurrenceInput {
  frequency: "DAILY" | "WEEKLY" | "MONTHLY";
  interval: number;
  daysOfWeek: number[];
  startDate: string; // YYYY-MM-DD
  endDate: string | null; // YYYY-MM-DD or null
}

const DAY_MS = 24 * 60 * 60 * 1000;
const LOOKAHEAD_DAYS = 30;

function isoToUtcDate(s: string): Date {
  return new Date(s + "T00:00:00.000Z");
}
function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function dayBefore(d: Date): Date {
  return startOfUtcDay(new Date(d.getTime() - DAY_MS));
}

/** Pick only the defined keys from an object. */
function pickDefined<T extends object, K extends keyof T>(
  obj: T,
  keys: readonly K[],
): Partial<Pick<T, K>> {
  const out: Partial<Pick<T, K>> = {};
  for (const k of keys) {
    if (obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

/** Order-insensitive equality for two number arrays. */
function sameNumberSet(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

/** UTC-day equality for two (possibly null) dates. */
function sameDay(a: Date | null, b: Date | null): boolean {
  if (a === null || b === null) return a === b;
  return startOfUtcDay(a).getTime() === startOfUtcDay(b).getTime();
}

/**
 * Delete a recurring task at series scope.
 *  - "following": delete this instance + every later sibling, and cap the
 *    template's endDate to the day before this occurrence so it stops here.
 *  - "all": delete the template and every instance it ever produced.
 *
 * Returns false when the task doesn't exist or isn't recurring.
 */
export async function deleteRecurringSeries(
  workspaceId: string,
  taskId: string,
  scope: "following" | "all",
): Promise<boolean> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, workspaceId },
    select: { id: true, dueDate: true, recurringTemplateId: true },
  });
  if (!task || !task.recurringTemplateId) return false;
  const templateId = task.recurringTemplateId;

  // Tasks must be deleted BEFORE the template — the Task→template FK is
  // onDelete: SetNull, so deleting the template first would orphan the
  // rows (FK nulled) and the by-template delete would then match nothing.
  async function deleteWholeSeries() {
    await prisma.$transaction([
      prisma.task.deleteMany({
        where: { workspaceId, recurringTemplateId: templateId },
      }),
      prisma.recurringTaskTemplate.deleteMany({
        where: { id: templateId, workspaceId },
      }),
    ]);
  }

  if (scope === "all") {
    await deleteWholeSeries();
    return true;
  }

  // scope === "following"
  const template = await prisma.recurringTaskTemplate.findFirst({
    where: { id: templateId, workspaceId },
    select: { startDate: true },
  });
  if (!template) return false;

  // A generated instance always carries a dueDate; guard defensively.
  if (!task.dueDate) return false;
  const cutoff = startOfUtcDay(task.dueDate);

  // If the split point is at/before the template start, "following" covers
  // the entire series — that's just "all".
  if (cutoff <= startOfUtcDay(template.startDate)) {
    await deleteWholeSeries();
    return true;
  }

  await prisma.$transaction([
    prisma.recurringTaskTemplate.updateMany({
      where: { id: templateId, workspaceId },
      data: { endDate: dayBefore(cutoff) },
    }),
    prisma.task.deleteMany({
      where: {
        workspaceId,
        recurringTemplateId: templateId,
        dueDate: { gte: cutoff },
      },
    }),
  ]);
  return true;
}

/**
 * Edit a recurring task at series scope.
 *  - "all": update the template (blueprint + recurrence rule), and propagate
 *    the *scalar* blueprint fields (name, description, priority, assignee,
 *    important/urgent, tags) to every existing instance. Deliberately does
 *    NOT touch each instance's kanban stage, progress, due date, or
 *    subtask-completion — that's live work-state. Recurrence-rule changes
 *    only affect future generation.
 *  - "following": split the series. The old template's endDate is capped to
 *    the day before this occurrence; a new template carries the edits
 *    forward from this occurrence; this + later instances are deleted and
 *    regenerated from the new template.
 *
 * Returns false when the task doesn't exist or isn't recurring.
 */
export async function editRecurringSeries(
  workspaceId: string,
  taskId: string,
  scope: "following" | "all",
  blueprint: SeriesBlueprintInput,
  recurrence: SeriesRecurrenceInput,
): Promise<boolean> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, workspaceId },
    select: { id: true, dueDate: true, recurringTemplateId: true },
  });
  if (!task || !task.recurringTemplateId) return false;
  const templateId = task.recurringTemplateId;

  const template = await prisma.recurringTaskTemplate.findFirst({
    where: { id: templateId, workspaceId },
    include: {
      tags: { select: { id: true } },
      subtaskTemplates: {
        select: { title: true, position: true },
        orderBy: { position: "asc" },
      },
    },
  });
  if (!template) return false;

  if (blueprint.tagIds && blueprint.tagIds.length > 0) {
    await assertTagsInWorkspace(workspaceId, blueprint.tagIds);
  }

  // daysOfWeek is only meaningful for WEEKLY.
  const daysOfWeek =
    recurrence.frequency === "WEEKLY" ? recurrence.daysOfWeek : [];
  const newStart = isoToUtcDate(recurrence.startDate);
  const newEnd = recurrence.endDate ? isoToUtcDate(recurrence.endDate) : null;

  // Did the recurrence *rule* change (vs just blueprint fields)? A rule
  // change relays the schedule, so future instances have to be regenerated.
  const ruleChanged =
    template.frequency !== recurrence.frequency ||
    template.interval !== recurrence.interval ||
    !sameNumberSet(template.daysOfWeek, daysOfWeek) ||
    !sameDay(template.startDate, newStart) ||
    !sameDay(template.endDate, newEnd);

  // ---- scope: all ----
  if (scope === "all") {
    const todayMidnight = startOfUtcDay(new Date());

    await prisma.$transaction(async (tx) => {
      // 1. Update the template — blueprint + recurrence rule. When the rule
      //    changed, reset lastGeneratedDate so generateInstances re-lays-out
      //    the future from scratch (the dedup check keeps past instances).
      await tx.recurringTaskTemplate.update({
        where: { id: templateId },
        data: {
          ...pickDefined(blueprint, [
            "name",
            "description",
            "priorityId",
            "kanbanStageId",
            "assigneeId",
            "isImportant",
            "isUrgent",
          ]),
          frequency: recurrence.frequency,
          interval: recurrence.interval,
          daysOfWeek,
          startDate: newStart,
          endDate: newEnd,
          ...(ruleChanged ? { lastGeneratedDate: null } : {}),
          ...(blueprint.tagIds !== undefined
            ? { tags: { set: blueprint.tagIds.map((id) => ({ id })) } }
            : {}),
        },
      });

      // 2. Rule changed → drop the FUTURE instances so they re-lay-out under
      //    the new rule. Past/today instances are left alone (can't un-happen
      //    them). When only blueprint fields changed, every instance is kept
      //    and just gets the metadata propagated below.
      if (ruleChanged) {
        await tx.task.deleteMany({
          where: {
            workspaceId,
            recurringTemplateId: templateId,
            dueDate: { gt: todayMidnight },
          },
        });
      }

      // 3. Propagate the SCALAR blueprint fields to every remaining instance.
      //    Pointedly NOT kanbanStage / progress / dueDate / subtasks — those
      //    are live work-state and force-rewriting them would trample
      //    in-progress tasks.
      const scalar = pickDefined(blueprint, [
        "name",
        "description",
        "priorityId",
        "assigneeId",
        "isImportant",
        "isUrgent",
      ]);
      if (Object.keys(scalar).length > 0) {
        await tx.task.updateMany({
          where: { workspaceId, recurringTemplateId: templateId },
          data: scalar,
        });
      }

      // 4. Tags are m2m — updateMany can't set them, so loop the instances.
      if (blueprint.tagIds !== undefined) {
        const instances = await tx.task.findMany({
          where: { workspaceId, recurringTemplateId: templateId },
          select: { id: true },
        });
        for (const inst of instances) {
          await tx.task.update({
            where: { id: inst.id },
            data: { tags: { set: blueprint.tagIds.map((id) => ({ id })) } },
          });
        }
      }
    });

    // 5. Rule changed → regenerate the future from the (reset) template.
    if (ruleChanged) {
      try {
        await generateInstances(workspaceId, templateId, new Date(), LOOKAHEAD_DAYS);
      } catch (e) {
        console.error("generateInstances failed after 'all' rule change", {
          templateId,
          error: e,
        });
      }
    }
    return true;
  }

  // ---- scope: following (series split) ----
  if (!task.dueDate) return false;
  const cutoff = startOfUtcDay(task.dueDate);

  // If the split point is at/before the template start, "following" covers
  // the whole series — that's just "all".
  if (cutoff <= startOfUtcDay(template.startDate)) {
    return editRecurringSeries(workspaceId, taskId, "all", blueprint, recurrence);
  }

  const newTemplateId = await prisma.$transaction(async (tx) => {
    // 1. Cap the old template the day before the split point.
    await tx.recurringTaskTemplate.update({
      where: { id: templateId },
      data: { endDate: dayBefore(cutoff) },
    });

    // 2. New template carries the edits forward from the split point. Its
    //    subtask templates are copied verbatim from the old one — the edit
    //    drawer edits instance checklists, not the series' subtask template.
    const created = await tx.recurringTaskTemplate.create({
      data: {
        workspaceId,
        createdById: template.createdById,
        projectId: template.projectId,
        name: blueprint.name ?? template.name,
        description:
          blueprint.description !== undefined
            ? blueprint.description
            : template.description,
        priorityId: blueprint.priorityId ?? template.priorityId,
        kanbanStageId: blueprint.kanbanStageId ?? template.kanbanStageId,
        assigneeId:
          blueprint.assigneeId !== undefined
            ? blueprint.assigneeId
            : template.assigneeId,
        isImportant: blueprint.isImportant ?? template.isImportant,
        isUrgent: blueprint.isUrgent ?? template.isUrgent,
        frequency: recurrence.frequency,
        interval: recurrence.interval,
        daysOfWeek,
        startDate: cutoff,
        endDate: recurrence.endDate ? isoToUtcDate(recurrence.endDate) : null,
        isActive: true,
        tags: {
          connect: (blueprint.tagIds ?? template.tags.map((t) => t.id)).map(
            (id) => ({ id }),
          ),
        },
        subtaskTemplates:
          template.subtaskTemplates.length > 0
            ? {
                create: template.subtaskTemplates.map((s) => ({
                  title: s.title,
                  position: s.position,
                })),
              }
            : undefined,
      },
    });

    // 3. Drop this instance + every later sibling of the OLD template.
    await tx.task.deleteMany({
      where: {
        workspaceId,
        recurringTemplateId: templateId,
        dueDate: { gte: cutoff },
      },
    });

    return created.id;
  });

  // 4. Materialise the new template's instances. Outside the transaction —
  //    mirrors the create route; a transient generation failure shouldn't
  //    strand the split.
  try {
    await generateInstances(workspaceId, newTemplateId, new Date(), LOOKAHEAD_DAYS);
  } catch (e) {
    console.error("generateInstances failed after series split", {
      newTemplateId,
      error: e,
    });
  }
  return true;
}
