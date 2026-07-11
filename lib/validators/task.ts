import { z } from "zod";
import { subtaskInputSchema, SUBTASKS_PER_TASK_MAX } from "./subtask";

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), { message: "Invalid date" });

// Empty string → undefined/null coercion for HTML form inputs
const emptyToUndef = (v: unknown) => (v === "" ? undefined : v);
const emptyToNull = (v: unknown) => (v === "" ? null : v);

// Shared refine: when both dates are present, startDate must be on or before dueDate.
// String comparison works because both are ISO YYYY-MM-DD (lexicographically sortable).
const startBeforeDue = (data: { startDate?: string | null; dueDate?: string | null }) => {
  if (!data.startDate || !data.dueDate) return true;
  return data.startDate <= data.dueDate;
};
const startBeforeDueMsg = "Start date must be on or before due date";

export const createTaskSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1, "Task name is required").max(500),
  description: z.string().max(10_000).optional(),
  isImportant: z.boolean().optional(),
  isUrgent: z.boolean().optional(),
  priorityId: z.string().min(1),
  kanbanStageId: z.string().min(1),
  assigneeId: z.string().min(1).optional(),
  tagIds: z.array(z.string()).optional(),
  startDate: isoDate.optional(),
  dueDate: isoDate.optional(),
  progressPct: z.number().int().min(0).max(100).optional(),
  notes: z.string().max(50_000).optional(),
  subtasks: z.array(subtaskInputSchema).max(SUBTASKS_PER_TASK_MAX).optional(),
}).refine(startBeforeDue, { message: startBeforeDueMsg, path: ["startDate"] });

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

/**
 * Schema used with react-hook-form's zodResolver. Preprocesses empty strings from HTML
 * inputs into undefined so optional fields don't fail validation when left blank.
 */
export const createTaskFormSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1, "Task name is required").max(500),
  description: z.string().max(10_000).optional(),
  isImportant: z.boolean().optional(),
  isUrgent: z.boolean().optional(),
  priorityId: z.string().min(1),
  kanbanStageId: z.string().min(1),
  assigneeId: z.preprocess(emptyToUndef, z.string().min(1).optional()),
  tagIds: z.array(z.string()).optional(),
  startDate: z.preprocess(emptyToUndef, isoDate.optional()),
  dueDate: z.preprocess(emptyToUndef, isoDate.optional()),
  progressPct: z.number().int().min(0).max(100).optional(),
  notes: z.string().max(50_000).optional(),
  subtasks: z.array(subtaskInputSchema).max(SUBTASKS_PER_TASK_MAX).optional(),
}).refine(startBeforeDue, { message: startBeforeDueMsg, path: ["startDate"] });

export const updateTaskSchema = z.object({
  // Present only when moving the task to another project. Workspace
  // membership of the target project is validated in the service layer.
  projectId: z.string().min(1).optional(),
  name: z.string().min(1, "Task name is required").max(500).optional(),
  description: z.string().max(10_000).nullable().optional(),
  isImportant: z.boolean().optional(),
  isUrgent: z.boolean().optional(),
  priorityId: z.string().min(1).optional(),
  kanbanStageId: z.string().min(1).optional(),
  assigneeId: z.string().min(1).nullable().optional(),
  tagIds: z.array(z.string()).optional(),
  startDate: isoDate.nullable().optional(),
  dueDate: isoDate.nullable().optional(),
  progressPct: z.number().int().min(0).max(100).optional(),
  notes: z.string().max(50_000).nullable().optional(),
  progressManual: z.boolean().optional(),
}).refine(startBeforeDue, { message: startBeforeDueMsg, path: ["startDate"] });

export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const updateTaskFormSchema = z.object({
  projectId: z.string().min(1).optional(),
  name: z.string().min(1, "Task name is required").max(500).optional(),
  description: z.string().max(10_000).nullable().optional(),
  isImportant: z.boolean().optional(),
  isUrgent: z.boolean().optional(),
  priorityId: z.string().min(1).optional(),
  kanbanStageId: z.string().min(1).optional(),
  assigneeId: z.preprocess(emptyToNull, z.string().min(1).nullable().optional()),
  tagIds: z.array(z.string()).optional(),
  startDate: z.preprocess(emptyToNull, isoDate.nullable().optional()),
  dueDate: z.preprocess(emptyToNull, isoDate.nullable().optional()),
  progressPct: z.number().int().min(0).max(100).optional(),
  notes: z.string().max(50_000).nullable().optional(),
  progressManual: z.boolean().optional(),
}).refine(startBeforeDue, { message: startBeforeDueMsg, path: ["startDate"] });
