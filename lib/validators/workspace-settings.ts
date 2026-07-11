import { z } from "zod";

export const updateWorkingDaysSchema = z.object({
  workingDays: z.array(z.number().int().min(1).max(7)).max(7),
});

export type UpdateWorkingDaysInput = z.infer<typeof updateWorkingDaysSchema>;

/** Workspace name is admin-editable from Settings. Trimmed, 1–100 chars —
 *  short enough to fit in the topbar pill without truncation flicker, long
 *  enough for "The Pugh Family · Personal" style names. */
export const updateWorkspaceNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Workspace name is required")
    .max(100, "Workspace name must be 100 characters or fewer"),
});

export type UpdateWorkspaceNameInput = z.infer<typeof updateWorkspaceNameSchema>;
