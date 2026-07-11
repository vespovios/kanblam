import { z } from "zod";

export const moveTaskSchema = z.object({
  kanbanStageId: z.string().min(1),
  newIndex: z.number().int().min(0).optional(),
  assigneeId: z.string().min(1).optional(),
});

export type MoveTaskInput = z.infer<typeof moveTaskSchema>;
