import { redirect, notFound } from "next/navigation";
import { features } from "@/lib/config/features";
import { prisma } from "@/lib/db";
import {
  requireAdminContext,
  WorkspaceAuthError,
} from "@/lib/auth/workspace-scope";
import { BillingSettingsView } from "@/components/billing/billing-settings-view";
import { PageRealtimeBridge } from "@/components/realtime/page-realtime-bridge";

/**
 * Settings → Billing. ADMIN-gated server-side via `requireAdminContext`; a
 * non-admin is bounced to /dashboard, an unauthenticated caller to /login.
 *
 * **Self-host invariant:** when `BILLING_ENABLED` is off (every self-host
 * install and pre-launch hosted deploy) this page does not exist — `notFound()`
 * before any auth or DB read, mirroring the 404 the billing API routes return.
 */
export default async function BillingSettingsPage() {
  // Flag off: billing UI does not exist on self-host. Hard no-op.
  if (!features.billingEnabled) notFound();

  let workspaceId: string;
  try {
    ({ workspaceId } = await requireAdminContext());
  } catch (err) {
    if (err instanceof WorkspaceAuthError) {
      redirect(err.status === 403 ? "/dashboard" : "/login");
    }
    throw err;
  }

  const billing = await prisma.workspaceBilling.findUnique({
    where: { workspaceId },
    select: {
      status: true,
      trialEndsAt: true,
      currentPeriodEnd: true,
      gracePeriodEndsAt: true,
    },
  });

  return (
    <div className="space-y-8 max-w-3xl">
      <PageRealtimeBridge kinds={["workspace"]} />
      <div>
        <h2 className="text-2xl font-semibold">Billing</h2>
        <p className="text-muted-foreground">
          Manage the hosted subscription for this workspace.
        </p>
      </div>
      <BillingSettingsView
        status={billing?.status ?? null}
        trialEndsAt={billing?.trialEndsAt?.toISOString() ?? null}
        currentPeriodEnd={billing?.currentPeriodEnd?.toISOString() ?? null}
        gracePeriodEndsAt={billing?.gracePeriodEndsAt?.toISOString() ?? null}
      />
    </div>
  );
}
