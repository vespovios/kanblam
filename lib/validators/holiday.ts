import { z } from "zod";

export const createHolidaySchema = z.object({
  name: z.string().trim().min(1).max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
});

export type CreateHolidayInput = z.infer<typeof createHolidaySchema>;

export const importPreviewSchema = z.object({
  country: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/, "Must be a 2-letter country code")
    .transform((s) => s.toUpperCase()),
  subdivision: z
    .string()
    .trim()
    .min(1)
    .max(10)
    .nullish()
    .transform((v) => v ?? null),
  year: z.number().int().min(2000).max(2100),
  includeObservances: z.boolean().default(false),
});

export type ImportPreviewInput = z.infer<typeof importPreviewSchema>;

export const importCommitSchema = importPreviewSchema.extend({
  selectedDates: z
    .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"))
    .min(1)
    .max(366),
});

export type ImportCommitInput = z.infer<typeof importCommitSchema>;
