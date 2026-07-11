import { z } from "zod";

export const COMMENT_BODY_MAX = 10_000;

export const createCommentSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Comment cannot be empty")
    .max(COMMENT_BODY_MAX, `Comment cannot exceed ${COMMENT_BODY_MAX} characters`),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;
