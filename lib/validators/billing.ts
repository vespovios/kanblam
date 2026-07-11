import { z } from "zod";

/**
 * Checkout request body for `POST /api/billing/checkout`.
 *
 * Mirrors the purchasable-plan shape in `@/lib/billing/products` (`PlanKey`):
 * exactly one hosted tier today (`hosted_standard`) at a monthly or annual
 * cadence. Kept strict — an unknown tier/cadence is a 400, not a silent
 * fall-through to a missing product id.
 */
export const checkoutSchema = z.object({
  tier: z.literal("hosted_standard"),
  cadence: z.enum(["monthly", "annual"]),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
