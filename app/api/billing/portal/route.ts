import { NextResponse } from "next/server";
import { features } from "@/lib/config/features";
import { requireAdminContext, WorkspaceAuthError } from "@/lib/auth/workspace-scope";
import { getPolarClient } from "@/lib/billing/polar";
import { loadAppUrl } from "@/lib/billing/access";

/**
 * POST /api/billing/portal — open the Polar customer portal for self-service
 * subscription management (payment methods, invoices, cancellation, resume).
 *
 * Mints a **single-use customer session** server-side and returns its hosted
 * `customerPortalUrl` for the client to redirect to. ADMIN-only (D7), and a hard
 * no-op when billing is off.
 *
 * Guardrails (see `the billing design notes (2026-05-24, private archive)` → PR 5):
 *
 *   - **Flag off ⇒ 404.** `BILLING_ENABLED=false` (every self-host install and
 *     pre-launch hosted deploy) means this route does not exist. Checked first —
 *     no auth, no DB, no Polar client.
 *   - **401 / 403** via `requireAdminContext` — unauthenticated, then non-admin.
 *   - **External-id keyed.** We address the Polar customer by
 *     `external_customer_id = workspaceId` (set at checkout initiation), so no
 *     local Polar-customer-id lookup is needed; the portal owns invoices and
 *     payment methods.
 *   - **503 when unconfigured.** Flag on but no Polar token ⇒ the deploy is
 *     misconfigured, not the request.
 */
export async function POST() {
  // Flag off: the billing route does not exist. Short-circuit before auth, DB,
  // or any Polar construction so the self-host invariant holds.
  if (!features.billingEnabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const ctx = await requireAdminContext();

    const polar = getPolarClient();
    if (!polar) {
      return NextResponse.json(
        { error: "Billing is not configured" },
        { status: 503 },
      );
    }

    // The portal return target needs a real public origin. Fail loudly (503)
    // rather than silently sending customers to localhost on a deploy that
    // forgot to set APP_URL.
    const appUrl = loadAppUrl();
    if (!appUrl) {
      return NextResponse.json(
        { error: "App URL not configured" },
        { status: 503 },
      );
    }

    // Mint a customer session keyed by our external id (the workspaceId). The
    // `returnUrl` shows a back button in the portal that returns to Settings.
    const session = await polar.customerSessions.create({
      externalCustomerId: ctx.workspaceId,
      returnUrl: `${appUrl}/settings/billing`,
    });

    return NextResponse.json({ url: session.customerPortalUrl });
  } catch (err) {
    if (err instanceof WorkspaceAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
