import { z } from "zod";

export const SUBTASK_TITLE_MAX = 200;
export const SUBTASKS_PER_TASK_MAX = 100;

export const subtaskTitleSchema = z
  .string()
  .trim()
  .min(1, "Title cannot be empty")
  .max(SUBTASK_TITLE_MAX, `Title cannot exceed ${SUBTASK_TITLE_MAX} characters`);

/** Shape used inside the Task create payload (POST /api/tasks `body.subtasks[]`). */
export const subtaskInputSchema = z.object({
  title: subtaskTitleSchema,
});

export const createSubtaskSchema = z.object({
  title: subtaskTitleSchema,
});
export type CreateSubtaskInput = z.infer<typeof createSubtaskSchema>;

export const updateSubtaskSchema = z
  .object({
    title: subtaskTitleSchema.optional(),
    completed: z.boolean().optional(),
  })
  .refine((v) => v.title !== undefined || v.completed !== undefined, {
    message: "At least one of title or completed must be provided",
  });
export type UpdateSubtaskInput = z.infer<typeof updateSubtaskSchema>;

export const reorderSubtasksSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1, "orderedIds cannot be empty"),
});
export type ReorderSubtasksInput = z.infer<typeof reorderSubtasksSchema>;
