import type { BillingStatus } from "@prisma/client";
import { SubscribeForm } from "@/components/billing/subscribe-form";
import { PortalButton } from "@/components/billing/portal-button";

interface Props {
  /** Current billing status, or `null` when no billing row exists yet. */
  status: BillingStatus | null;
  /** Lifecycle dates as ISO strings (or null), serialized by the page. */
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  gracePeriodEndsAt: string | null;
  /** Injectable clock for the trial countdown (tests pin this). */
  now?: string;
}

/** Format an ISO date string as a human date, or a fallback when absent. */
function fmtDate(iso: string | null): string {
  if (!iso) return "an upcoming date";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Whole days from `now` until `iso`, clamped at 0. Null when no date. */
function daysUntil(iso: string | null, now: string | undefined): number | null {
  if (!iso) return null;
  const end = new Date(iso).getTime();
  const ref = now ? new Date(now).getTime() : new Date().getTime();
  return Math.max(0, Math.ceil((end - ref) / 86_400_000));
}

/**
 * Settings → Billing presentational view. **Pure (no IO)** so it renders the
 * same way for any input and is trivially testable across every `BillingStatus`
 * (see the rendering test). The page wrapper does the ADMIN gate + DB read and
 * passes the serialized snapshot in.
 *
 * State → UI (per the billing plan, PR 5). No founding-member UI:
 *
 *   - NONE / no row → Subscribe + cadence selector (checkout)
 *   - TRIALING      → trial active + trialEndsAt date/countdown + manage (portal)
 *   - ACTIVE        → subscribed + renewal date + manage (portal)
 *   - PAST_DUE      → payment failed + grace deadline + update payment (portal)
 *   - READ_ONLY     → lapsed + Reactivate (checkout)
 *   - CANCELED      → runs until period end + Resume (portal)
 *   - SUSPENDED     → same shape as READ_ONLY (Reactivate via checkout)
 */
export function BillingSettingsView({
  status,
  trialEndsAt,
  currentPeriodEnd,
  gracePeriodEndsAt,
  now,
}: Props) {
  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div>
        <h3 className="font-semibold">Billing</h3>
        <p className="text-sm text-muted-foreground">
          Manage the hosted subscription for this workspace.
        </p>
      </div>
      {renderState()}
    </div>
  );

  function renderState() {
    switch (status) {
      case null:
      case "NONE":
        return (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This workspace isn&apos;t subscribed yet. Choose a billing cadence
              to subscribe and unlock hosted billing.
            </p>
            <SubscribeForm label="Subscribe" />
          </div>
        );

      case "TRIALING": {
        const days = daysUntil(trialEndsAt, now);
        return (
          <div className="space-y-3">
            <p className="text-sm">
              <span className="font-medium text-foreground">
                Your trial is active.
              </span>{" "}
              <span className="text-muted-foreground">
                It ends on {fmtDate(trialEndsAt)}
                {days !== null && ` — ${days} day${days === 1 ? "" : "s"} left`}.
              </span>
            </p>
            <PortalButton label="Manage subscription" variant="outline" />
          </div>
        );
      }

      case "ACTIVE":
        return (
          <div className="space-y-3">
            <p className="text-sm">
              <span className="font-medium text-foreground">
                You&apos;re subscribed.
              </span>{" "}
              <span className="text-muted-foreground">
                Your subscription renews on {fmtDate(currentPeriodEnd)}.
              </span>
            </p>
            <PortalButton label="Manage subscription" variant="outline" />
          </div>
        );

      case "PAST_DUE":
        return (
          <div className="space-y-3">
            <p className="text-sm">
              <span className="font-medium text-destructive">
                Your last payment failed.
              </span>{" "}
              <span className="text-muted-foreground">
                Update your payment method before {fmtDate(gracePeriodEndsAt)} to
                keep this workspace active.
              </span>
            </p>
            <PortalButton label="Update payment method" />
          </div>
        );

      case "CANCELED":
        return (
          <div className="space-y-3">
            <p className="text-sm">
              <span className="font-medium text-foreground">
                Your subscription is canceled.
              </span>{" "}
              <span className="text-muted-foreground">
                It runs until {fmtDate(currentPeriodEnd)}; after that this
                workspace becomes read-only. Resume any time before then.
              </span>
            </p>
            <PortalButton label="Resume subscription" variant="outline" />
          </div>
        );

      case "READ_ONLY":
      case "SUSPENDED":
        return (
          <div className="space-y-3">
            <p className="text-sm">
              <span className="font-medium text-destructive">
                This workspace is read-only.
              </span>{" "}
              <span className="text-muted-foreground">
                Its hosted subscription has lapsed. Reactivate to make changes
                again — your data is untouched.
              </span>
            </p>
            <SubscribeForm label="Reactivate subscription" />
          </div>
        );

      default: {
        const _exhaustive: never = status;
        return _exhaustive;
      }
    }
  }
}
