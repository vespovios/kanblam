import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { features } from "@/lib/config/features";
import { requireAdminContext, WorkspaceAuthError } from "@/lib/auth/workspace-scope";
import { getPolarClient } from "@/lib/billing/polar";
import { loadAppUrl } from "@/lib/billing/access";
import { productIdFor } from "@/lib/billing/products";
import { checkoutSchema } from "@/lib/validators/billing";

/**
 * POST /api/billing/checkout — start a hosted-subscription purchase.
 *
 * Creates a **single-use Polar Checkout Session** for the caller's workspace and
 * returns its hosted `url` for the client to redirect to. ADMIN-only (D7), and a
 * hard no-op when billing is off.
 *
 * Guardrails (see `the billing design notes (2026-05-24, private archive)` → PR 3):
 *
 *   - **Flag off ⇒ 404.** `BILLING_ENABLED=false` (every self-host install and
 *     pre-launch hosted deploy) means this route does not exist. Checked before
 *     anything else — no auth, no DB, no Polar client.
 *   - **401 / 403** via `requireAdminContext` — unauthenticated, then non-admin.
 *   - **Polar is the merchant of record.** We send `external_customer_id =
 *     workspaceId` so Polar's customer maps 1:1 to our tenant; customer
 *     email/name come from the auth session; `metadata` carries
 *     `{ workspaceId, tier, initiatedBy }` for the webhook to correlate (PR 4).
 *   - **Lazy, idempotent `WorkspaceBilling`.** A row is created at checkout
 *     initiation if absent (status left at its default `NONE`); an existing row
 *     is never overwritten. Entitlement only flips later, via webhooks.
 */
export async function POST(req: Request) {
  // Flag off: the billing route does not exist. Must short-circuit before auth,
  // DB, or any Polar construction so the self-host invariant holds.
  if (!features.billingEnabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const ctx = await requireAdminContext();

    const body = await req.json().catch(() => null);
    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { tier, cadence } = parsed.data;

    // Resolve the Polar client and product id. With the flag on but billing not
    // fully configured (missing token or product ids), fail safe with 503 rather
    // than throwing a 500 — the deploy is misconfigured, not the request.
    const polar = getPolarClient();
    const productId = productIdFor({ tier, cadence });
    if (!polar || !productId) {
      return NextResponse.json(
        { error: "Billing is not configured" },
        { status: 503 },
      );
    }

    // The success/cancel redirect targets need a real public origin. Fail loudly
    // (503) rather than silently sending customers to localhost on a deploy that
    // forgot to set APP_URL.
    const appUrl = loadAppUrl();
    if (!appUrl) {
      return NextResponse.json(
        { error: "App URL not configured" },
        { status: 503 },
      );
    }

    // Customer identity for Polar comes from the authenticated session.
    const session = await auth();
    const sessionUser = session?.user as
      | { email?: string | null; name?: string | null }
      | undefined;
    const customerEmail = sessionUser?.email ?? undefined;
    const customerName = sessionUser?.name ?? undefined;

    // Lazily create the billing row at checkout initiation. Idempotent: never
    // overwrites an existing row (empty `update`), and status stays at its
    // schema default (`NONE`) — only webhooks change entitlement state.
    await prisma.workspaceBilling.upsert({
      where: { workspaceId: ctx.workspaceId },
      create: { workspaceId: ctx.workspaceId, externalCustomerId: ctx.workspaceId },
      update: {},
    });

    const checkout = await polar.checkouts.create({
      products: [productId],
      externalCustomerId: ctx.workspaceId,
      customerEmail,
      customerName,
      metadata: { workspaceId: ctx.workspaceId, tier, initiatedBy: ctx.userId },
      successUrl: `${appUrl}/billing/success`,
      // Polar's checkout session has no separate cancel_url; `returnUrl` is the
      // back-button target, which is our cancel landing page.
      returnUrl: `${appUrl}/billing/cancel`,
    });

    return NextResponse.json({ url: checkout.url });
  } catch (err) {
    if (err instanceof WorkspaceAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
