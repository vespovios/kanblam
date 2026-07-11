import { z } from "zod";

export const API_TOKEN_SCOPES = ["read", "write"] as const;
export type ApiTokenScope = (typeof API_TOKEN_SCOPES)[number];

/** Hard cap per user — plenty for real use, bounds abuse. */
export const API_TOKENS_PER_USER_MAX = 20;

const isoDate = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: "Invalid date" });

export const createApiTokenSchema = z.object({
  name: z.string().trim().min(1, "Token name is required").max(100),
  scopes: z
    .array(z.enum(API_TOKEN_SCOPES))
    .min(1, "Pick at least one scope")
    .default(["read"]),
  /** Optional expiry. No default expiry by design — self-host users hate
   *  surprise expiries; `lastUsedAt` in the Settings list gives visibility
   *  instead. */
  expiresAt: isoDate.optional(),
});

export type CreateApiTokenInput = z.infer<typeof createApiTokenSchema>;
