import { NextResponse } from "next/server";
import { features } from "@/lib/config/features";
import { runBillingReconcile } from "@/lib/billing/reconcile";

/**
 * POST /api/cron/reconcile-billing — hourly billing reconcile backstop.
 *
 * Replays failed webhook events, applies clock-driven lifecycle transitions, and
 * reconciles drift against Polar's customer state (see `@/lib/billing/reconcile`).
 *
 * Guardrails:
 *
 *   - **Flag off ⇒ 404.** `BILLING_ENABLED=false` (every self-host install and
 *     pre-launch hosted deploy) means this route does not exist. Checked first,
 *     before any secret read or DB access — upholds the self-host invariant.
 *   - **CRON_SECRET bearer auth**, identical to `generate-recurring-tasks`: 500
 *     if the secret is unset, 401 on a missing/wrong bearer token.
 *
 * Node runtime: the reconcile worker uses Prisma and the Polar SDK.
 */
export const runtime = "nodejs";

export async function POST(req: Request) {
  // Flag off: the billing cron does not exist. Short-circuit before secrets,
  // DB, or any Polar construction.
  if (!features.billingEnabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runBillingReconcile();
  return NextResponse.json({ ...result, timestamp: new Date().toISOString() });
}
