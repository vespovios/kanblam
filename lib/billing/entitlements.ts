/**
 * Billing entitlements — the single question the app asks at request time:
 * "is this hosted workspace allowed to write, read-only, or fully suspended?"
 *
 * This module is **pure and flag-aware**. It performs no I/O: callers pass the
 * workspace's billing snapshot (or `null` when no row exists) and get an access
 * level back. The DB read lives at the enforcement seam (see
 * `requireWritableWorkspace` in `@/lib/auth/workspace-scope`), keeping this
 * logic trivially testable as a truth table.
 *
 * **Self-host invariant:** when `features.billingEnabled` is false — the default
 * on every self-host install and pre-launch hosted deploy — this always returns
 * `"full"`. No AGPL feature is ever gated by subscription state. That invariant
 * is the most important thing this file guarantees; see the unit tests.
 *
 * Entitlement gates *hosted-service lifecycle* (active vs read-only vs
 * suspended), never *feature visibility*. See
 * `the billing design notes (2026-05-24, private archive)`.
 */

import type { BillingStatus } from "@prisma/client";
import { features } from "@/lib/config/features";

export type WorkspaceAccessLevel = "full" | "read-only" | "suspended";

/**
 * The minimal slice of `WorkspaceBilling` the access decision needs. Accepting
 * just these fields (rather than the whole row) keeps the helper pure and lets
 * callers `select` only what they read.
 */
export interface BillingSnapshot {
  status: BillingStatus;
  currentPeriodEnd: Date | null;
}

/**
 * Resolve a workspace's access level from its billing snapshot.
 *
 * Rules (all short-circuit when billing is off), per the billing plan's
 * "Entitlement & enforcement model":
 *
 *   1. `!features.billingEnabled`            ⇒ "full"  (self-host invariant)
 *   2. no billing row (`null`)               ⇒ "full"
 *   3. status ∈ {NONE, ACTIVE, TRIALING, PAST_DUE} ⇒ "full"
 *      (PAST_DUE stays writable during grace — D2)
 *   4. CANCELED with `currentPeriodEnd` in the future ⇒ "full" until it passes,
 *      then it lapses to "read-only" (D3 default; deeper states are config-gated)
 *   5. status == READ_ONLY                   ⇒ "read-only"
 *   6. status == SUSPENDED                   ⇒ "suspended"
 *
 * @param billing snapshot for the workspace, or `null` if no row exists yet.
 * @param now injectable clock for the CANCELED period-end comparison (tests).
 */
export function workspaceAccessLevel(
  billing: BillingSnapshot | null,
  now: Date = new Date(),
): WorkspaceAccessLevel {
  // Rule 1: billing disabled ⇒ everything is fully writable. This is the
  // self-host / pre-launch path and must never fall through to a gate.
  if (!features.billingEnabled) return "full";

  // Rule 2: no billing row ⇒ nothing has been provisioned; treat as full.
  if (!billing) return "full";

  switch (billing.status) {
    case "NONE":
    case "ACTIVE":
    case "TRIALING":
    case "PAST_DUE":
      return "full";

    case "CANCELED":
      // Entitlements persist until the paid period actually ends, then lapse.
      return billing.currentPeriodEnd && billing.currentPeriodEnd.getTime() > now.getTime()
        ? "full"
        : "read-only";

    case "READ_ONLY":
      return "read-only";

    case "SUSPENDED":
      return "suspended";

    default: {
      // Exhaustiveness guard: a new BillingStatus must be handled explicitly
      // rather than silently granting or denying access.
      const _exhaustive: never = billing.status;
      return _exhaustive;
    }
  }
}
