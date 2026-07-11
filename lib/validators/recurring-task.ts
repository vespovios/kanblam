import { z } from "zod";
import { subtaskTitleSchema, SUBTASKS_PER_TASK_MAX } from "./subtask";

export const recurrenceFrequencyEnum = z.enum(["DAILY", "WEEKLY", "MONTHLY"]);

export const subtaskTemplateInputSchema = z.object({
  id: z.string().optional(), // present = update existing; absent = create new
  title: subtaskTitleSchema,
});

const isoDateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD");

/**
 * The bare recurrence rule — used by the scoped task-edit endpoint
 * (PATCH /api/tasks/[id] with scope "following" | "all"), which carries a
 * recurrence rule alongside the task's blueprint fields. `endDate` is null
 * for an indefinite series.
 */
export const recurrenceRuleSchema = z.object({
  frequency: recurrenceFrequencyEnum,
  interval: z.number().int().min(1).max(365),
  daysOfWeek: z.array(z.number().int().min(1).max(7)).max(7),
  startDate: isoDateString,
  endDate: isoDateString.nullable(),
});
export type RecurrenceRuleInput = z.infer<typeof recurrenceRuleSchema>;

const baseTemplateFields = {
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
  projectId: z.string().min(1),
  priorityId: z.string().min(1),
  kanbanStageId: z.string().min(1),
  assigneeId: z.string().nullable().optional(),
  tagIds: z.array(z.string()).optional(),
  subtaskTemplates: z.array(subtaskTemplateInputSchema).max(SUBTASKS_PER_TASK_MAX).optional(),
  isImportant: z.boolean().optional(),
  isUrgent: z.boolean().optional(),

  frequency: recurrenceFrequencyEnum,
  interval: z.number().int().min(1).max(365),
  daysOfWeek: z.array(z.number().int().min(1).max(7)).max(7),
  startDate: isoDateString,
  endDate: isoDateString.nullable().optional(),
} as const;

export const createRecurringTaskSchema = z.object(baseTemplateFields);
export type CreateRecurringTaskInput = z.infer<typeof createRecurringTaskSchema>;

export const updateRecurringTaskSchema = z.object({
  ...baseTemplateFields,
  isActive: z.boolean().optional(),
}).partial();
export type UpdateRecurringTaskInput = z.infer<typeof updateRecurringTaskSchema>;

const emptyStr = (v: unknown) => (v === "" ? undefined : v);
const emptyOrNull = (v: unknown) => (v === "" || v == null ? null : v);

const formTemplateFields = {
  ...baseTemplateFields,
  description: z.preprocess(emptyStr, z.string().max(2000).optional()),
  endDate: z.preprocess(emptyOrNull, isoDateString.nullable().optional()),
} as const;

export const createRecurringTaskFormSchema = z.object(formTemplateFields);
export type CreateRecurringTaskFormInput = z.infer<typeof createRecurringTaskFormSchema>;
