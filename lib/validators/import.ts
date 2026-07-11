import { z } from "zod";

/** Section-mapping strategy chosen by the user at import time. */
export const importModeSchema = z.enum(["sections-as-projects", "one-project"]);

/** Body for POST /api/import/asana/projects — token only. */
export const asanaProjectsSchema = z.object({
  token: z.string().min(1, "Asana token is required"),
});

/** Body for the preview + commit routes. */
export const asanaImportSchema = z.object({
  token: z.string().min(1, "Asana token is required"),
  projectGid: z.string().min(1, "Pick an Asana project"),
  mode: importModeSchema,
});

export type AsanaImportInput = z.infer<typeof asanaImportSchema>;
