import { z } from "zod";

const isoDate = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: "Invalid date" });

// Empty string → undefined coercion helper for HTML form inputs
const emptyStr = (v: unknown) => (v === "" ? undefined : v);

export const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().min(1).max(20),
  statusId: z.string().min(1),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  projectLeadId: z.string().min(1).optional(),
  clientName: z.string().max(200).optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

/**
 * Schema used with react-hook-form's zodResolver. Identical to createProjectSchema
 * but preprocesses empty strings (from HTML date/text inputs) into undefined so that
 * optional fields are not rejected when the user leaves them blank.
 */
export const createProjectFormSchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().min(1).max(20),
  statusId: z.string().min(1),
  startDate: z.preprocess(emptyStr, isoDate.optional()),
  endDate: z.preprocess(emptyStr, isoDate.optional()),
  projectLeadId: z.preprocess(emptyStr, z.string().min(1).optional()),
  clientName: z.string().max(200).optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  code: z.string().min(1).max(20).optional(),
  statusId: z.string().min(1).optional(),
  startDate: isoDate.nullable().optional(),
  endDate: isoDate.nullable().optional(),
  projectLeadId: z.string().min(1).nullable().optional(),
  clientName: z.string().max(200).nullable().optional(),
});

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const updateProjectFormSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  code: z.string().min(1).max(20).optional(),
  statusId: z.string().min(1).optional(),
  startDate: z.preprocess(emptyStr, isoDate.nullable().optional()),
  endDate: z.preprocess(emptyStr, isoDate.nullable().optional()),
  projectLeadId: z.preprocess(emptyStr, z.string().min(1).nullable().optional()),
  clientName: z.string().max(200).nullable().optional(),
});
