import Link from "next/link";
import type { BillingStatus } from "@prisma/client";

interface Props {
  /** The workspace's current billing status, or `null` if no row exists yet. */
  status: BillingStatus | null;
}

/**
 * Presentational success-landing view, kept pure (no IO) so it renders the same
 * way for any `status` and is trivially testable across every `BillingStatus`.
 * The page wrapper does the session + DB read and passes `status` in.
 *
 * Two states only, per the billing plan (PR 3):
 *
 *   - **active** — the subscription is live (`ACTIVE`/`TRIALING`); the webhook
 *     has already flipped entitlement. Confirm and send them back to the app.
 *   - **pending** — payment was taken but the `order.paid`/`subscription.active`
 *     webhook hasn't landed yet (status still `NONE`, or any non-active state).
 *     Reassure that it's processing; entitlement will catch up.
 *
 * No analytics: this lives under the authenticated app, which is never
 * instrumented (PostHog is public-routes-only).
 */
export function CheckoutSuccessView({ status }: Props) {
  const active = status === "ACTIVE" || status === "TRIALING";

  return (
    <div className="mx-auto max-w-md space-y-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">
        {active ? "You're all set" : "Payment received"}
      </h1>
      <p className="text-muted-foreground">
        {active
          ? "Your hosted subscription is active. Thanks for supporting KanBlam."
          : "Thanks for your payment. We're finalising your subscription — this " +
            "usually takes a few moments. You can keep working in the meantime."}
      </p>
      <div className="pt-2">
        <Link
          href="/dashboard"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Back to your workspace
        </Link>
      </div>
    </div>
  );
}
