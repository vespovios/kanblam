import { requireUser } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { CheckoutSuccessView } from "@/components/billing/checkout-success-view";

/**
 * Checkout success landing — Polar's `success_url` returns here after payment.
 *
 * Reads the workspace's current `WorkspaceBilling.status` and renders an
 * active-vs-pending confirmation. Entitlement is flipped by webhooks (PR 4), so
 * immediately after redirect the status may still be `NONE` ("pending"); the
 * view reassures the user while the webhook catches up.
 *
 * Lives under the authenticated app — **never instrumented** (no analytics).
 */
export default async function CheckoutSuccessPage() {
  const user = await requireUser();

  const billing = await prisma.workspaceBilling.findUnique({
    where: { workspaceId: user.workspaceId },
    select: { status: true },
  });

  return <CheckoutSuccessView status={billing?.status ?? null} />;
}
