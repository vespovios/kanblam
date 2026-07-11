import { z } from "zod";

export const createInviteSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
});

export type CreateInviteInput = z.infer<typeof createInviteSchema>;
