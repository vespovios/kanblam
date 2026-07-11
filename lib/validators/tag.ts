import { z } from "zod";

const NAME_PATTERN = /^[A-Za-z0-9_-]+$/;
const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

export const tagNameSchema = z
  .string()
  .trim()
  .min(1, "Tag name is required")
  .max(32, "Tag name max 32 chars")
  .regex(NAME_PATTERN, "Tag names can only contain letters, numbers, - and _ (no spaces)");

export const createTagSchema = z.object({
  name: tagNameSchema,
});

export const updateTagSchema = z.object({
  name: tagNameSchema.optional(),
  color: z.string().regex(HEX_PATTERN, "Color must be a 6-char hex like #aabbcc").optional(),
});

export type CreateTagInput = z.infer<typeof createTagSchema>;
export type UpdateTagInput = z.infer<typeof updateTagSchema>;
