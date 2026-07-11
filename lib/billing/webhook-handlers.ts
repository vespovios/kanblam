/**
 * Polar webhook → `WorkspaceBilling` state machine.
 *
 * Two layers, split so the lifecycle logic is trivially unit-testable:
 *
 *   - `computeBillingUpdate(event, current, now)` — **pure**. Maps a validated
 *     Polar event + the current billing row to the resulting `WorkspaceBilling`
 *     field writes. No I/O. Every handler computes the *resulting* state from the
 *     event payload (and, where unavoidable, the current status), **never**
 *     "previous + delta" — so out-of-order delivery resolves to last-write-wins
 *     on the absolute state each event carries, not a corrupted accumulation.
 *   - `processWebhookEvent(event, eventId, opts)` — the **idempotent** orchestrator.
 *     In one transaction it inserts the event (keyed by the Standard-Webhooks id),
 *     applies the state change, and marks it processed. A re-delivery hits the
 *     unique key and is a no-op. The apply+mark run inside a SAVEPOINT, so a
 *     side-effect failure rolls back only that step — the recorded event still
 *     commits with `processedAt` null and the error stored, for PR 6 reconcile to retry.
 *
 * Product decisions baked in here (see the billing plan, PR 4):
 *   - D1 trial: 14-day card-required Polar native trial. `subscription.created`
 *     with a trial ⇒ `TRIALING` + `trialEndsAt`.
 *   - D2 grace: 7 days. `subscription.revoked` ⇒ `PAST_DUE` +
 *     `gracePeriodEndsAt = now + 7d`. The PAST_DUE→READ_ONLY flip is the PR 6
 *     cron's job, **not** done here.
 *   - D3 enforcement: stop at READ_ONLY. No event wires into SUSPENDED here.
 *   - D5: no Founding handling — `isFoundingMember`/`foundingLockedUntil` untouched.
 *
 * See `the billing design notes (2026-05-24, private archive)` → PR 4.
 */

import type { BillingStatus, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";

/** D2 grace window applied on `subscription.revoked`. */
export const GRACE_PERIOD_DAYS = 7;

/** A validated Polar webhook event (as returned by `validateEvent`). */
export interface WebhookEvent {
  type: string;
  data: unknown;
}

/**
 * The writable slice of `WorkspaceBilling` a handler may set. All optional —
 * each handler writes only the fields its event is authoritative for. Assignable
 * to Prisma's update/create input.
 */
export interface BillingWrite {
  status?: BillingStatus;
  polarCustomerId?: string | null;
  polarSubscriptionId?: string | null;
  polarProductId?: string | null;
  polarPriceId?: string | null;
  polarStatus?: string | null;
  currentPeriodEnd?: Date | null;
  trialEndsAt?: Date | null;
  cancelAtPeriodEnd?: boolean;
  canceledAt?: Date | null;
  gracePeriodEndsAt?: Date | null;
  readOnlyAt?: Date | null;
}

/**
 * Result of mapping an event: the workspace it targets (or `null` when it can't
 * be resolved), and the field writes (`null` ⇒ record-only, no state change).
 */
export interface BillingDecision {
  workspaceId: string | null;
  write: BillingWrite | null;
}

/** The minimal current-row slice the pure mapper needs. */
export interface CurrentBilling {
  status: BillingStatus;
}

// ---------------------------------------------------------------------------
// Loosely-typed views over the Polar payloads. We read only the fields the
// state machine needs; the SDK's full types are far larger and snake↔camel
// normalisation is already done by `validateEvent`.
// ---------------------------------------------------------------------------

interface SubscriptionData {
  id: string;
  customerId: string;
  productId: string;
  status: string;
  currentPeriodEnd?: Date | string | null;
  trialEnd?: Date | string | null;
  cancelAtPeriodEnd?: boolean;
  canceledAt?: Date | string | null;
  metadata?: Record<string, unknown>;
  customer?: { id?: string; externalId?: string | null };
  prices?: Array<{ id?: string }>;
}

interface OrderData {
  customerId?: string;
  productId?: string | null;
  subscriptionId?: string | null;
  metadata?: Record<string, unknown>;
  customer?: { id?: string; externalId?: string | null };
  subscription?: { id?: string; status?: string; currentPeriodEnd?: Date | string | null } | null;
}

export interface CustomerStateData {
  id?: string;
  externalId?: string | null;
  metadata?: Record<string, unknown>;
  activeSubscriptions?: Array<{
    id: string;
    productId?: string;
    status: string;
    currentPeriodEnd?: Date | string | null;
    trialEnd?: Date | string | null;
    cancelAtPeriodEnd?: boolean;
    canceledAt?: Date | string | null;
  }>;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  return value instanceof Date ? value : new Date(value);
}

function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Resolve the target workspace id from an event. We send `external_customer_id`
 * (== workspaceId) and a `metadata.workspaceId` at checkout, and Polar echoes
 * them back across subscription/order/customer payloads. Checked in order of
 * directness; `null` when none is present (event is recorded but applies nowhere).
 */
export function resolveWorkspaceId(event: WebhookEvent): string | null {
  const data = (event.data ?? {}) as {
    metadata?: Record<string, unknown>;
    customer?: { externalId?: string | null };
    externalId?: string | null;
    subscription?: { metadata?: Record<string, unknown> } | null;
  };

  const fromMetadata = data.metadata?.workspaceId;
  if (typeof fromMetadata === "string" && fromMetadata) return fromMetadata;

  if (typeof data.customer?.externalId === "string" && data.customer.externalId) {
    return data.customer.externalId;
  }

  if (typeof data.externalId === "string" && data.externalId) return data.externalId;

  const fromSubMeta = data.subscription?.metadata?.workspaceId;
  if (typeof fromSubMeta === "string" && fromSubMeta) return fromSubMeta;

  return null;
}

/** Shared subscription-object → field writes (no lifecycle status decision). */
function subscriptionFields(s: SubscriptionData): BillingWrite {
  return {
    polarSubscriptionId: s.id,
    polarCustomerId: s.customerId,
    polarProductId: s.productId,
    polarPriceId: s.prices?.[0]?.id ?? null,
    polarStatus: s.status,
    currentPeriodEnd: toDate(s.currentPeriodEnd),
    cancelAtPeriodEnd: s.cancelAtPeriodEnd ?? false,
    canceledAt: toDate(s.canceledAt),
  };
}

/**
 * `customer.state_changed` — the authoritative repair path. Fully reconciles the
 * row from the snapshot regardless of prior local state.
 *
 *   - An active/trialing subscription in the snapshot ⇒ set ACTIVE/TRIALING and
 *     all its fields, clearing any grace/read-only that a missed event may have
 *     left behind.
 *   - No active subscription ⇒ the customer is no longer entitled. A workspace
 *     that never carried an entitlement (NONE) stays NONE; an entitled one drops
 *     to READ_ONLY (the D3 safe stop). Grace timing belongs to
 *     `subscription.revoked`; this path is the drift repair, not the grace clock.
 */
function reconcileCustomerState(
  data: CustomerStateData,
  current: CurrentBilling | null,
  now: Date,
  workspaceId: string | null,
): BillingDecision {
  const customerId = data.id ?? null;
  const active = data.activeSubscriptions?.[0];

  if (active) {
    const isTrial = active.status === "trialing" || active.trialEnd != null;
    return {
      workspaceId,
      write: {
        status: isTrial ? "TRIALING" : "ACTIVE",
        polarCustomerId: customerId,
        polarSubscriptionId: active.id,
        polarProductId: active.productId ?? null,
        polarStatus: active.status,
        currentPeriodEnd: toDate(active.currentPeriodEnd),
        trialEndsAt: isTrial ? toDate(active.trialEnd) : null,
        cancelAtPeriodEnd: active.cancelAtPeriodEnd ?? false,
        canceledAt: toDate(active.canceledAt),
        gracePeriodEndsAt: null,
        readOnlyAt: null,
      },
    };
  }

  const prior = current?.status ?? "NONE";
  const write: BillingWrite = { polarCustomerId: customerId };
  if (prior !== "NONE") {
    write.status = "READ_ONLY";
    write.readOnlyAt = now;
  }
  return { workspaceId, write };
}

/**
 * Pure event → state mapping. Returns the field writes to apply to
 * `WorkspaceBilling`, or `write: null` for record-only events (informational or
 * unknown). Order-independent: each handler emits the absolute resulting state.
 */
export function computeBillingUpdate(
  event: WebhookEvent,
  current: CurrentBilling | null,
  now: Date = new Date(),
): BillingDecision {
  const workspaceId = resolveWorkspaceId(event);

  switch (event.type) {
    case "subscription.created": {
      const s = event.data as SubscriptionData;
      const isTrial = s.status === "trialing" || s.trialEnd != null;
      return {
        workspaceId,
        write: {
          ...subscriptionFields(s),
          // D1: trial ⇒ TRIALING + trialEndsAt; otherwise stay NONE (no
          // entitlement) until the first order.paid / subscription.active.
          status: isTrial ? "TRIALING" : "NONE",
          trialEndsAt: isTrial ? toDate(s.trialEnd) : null,
          gracePeriodEndsAt: null,
          readOnlyAt: null,
        },
      };
    }

    case "subscription.active":
    case "subscription.uncanceled": {
      const s = event.data as SubscriptionData;
      // A card-required trial (D1) arrives as `active` while still `trialing`:
      // keep it TRIALING + trialEndsAt rather than flipping to ACTIVE early.
      const isTrial = s.status === "trialing" || s.trialEnd != null;
      return {
        workspaceId,
        write: {
          ...subscriptionFields(s),
          status: isTrial ? "TRIALING" : "ACTIVE",
          trialEndsAt: isTrial ? toDate(s.trialEnd) : null,
          // Active/uncanceled is current and paying: clear any pending cancel
          // and any grace/read-only a prior lapse may have set.
          cancelAtPeriodEnd: false,
          canceledAt: null,
          gracePeriodEndsAt: null,
          readOnlyAt: null,
        },
      };
    }

    case "subscription.updated": {
      // Reconcile the verbatim sync fields (period end, cancel flag, price/
      // product, Polar status). The lifecycle status enum is owned by the
      // dedicated active/canceled/revoked events — updated must not move it.
      const s = event.data as SubscriptionData;
      return { workspaceId, write: subscriptionFields(s) };
    }

    case "subscription.canceled": {
      const s = event.data as SubscriptionData;
      return {
        workspaceId,
        write: {
          ...subscriptionFields(s),
          // CANCELED keeps entitlements until currentPeriodEnd (entitlements.ts);
          // the actual lapse is the period-end transition in PR 6.
          status: "CANCELED",
          cancelAtPeriodEnd: true,
          canceledAt: toDate(s.canceledAt) ?? now,
        },
      };
    }

    case "subscription.revoked": {
      const s = event.data as SubscriptionData;
      return {
        workspaceId,
        write: {
          ...subscriptionFields(s),
          // D2: enter grace. PAST_DUE stays writable; the PR 6 cron flips to
          // READ_ONLY at gracePeriodEndsAt. We never set READ_ONLY here.
          status: "PAST_DUE",
          gracePeriodEndsAt: addDays(now, GRACE_PERIOD_DAYS),
        },
      };
    }

    case "order.paid": {
      const o = event.data as OrderData;
      return {
        workspaceId,
        write: {
          status: "ACTIVE",
          polarCustomerId: o.customerId ?? null,
          polarSubscriptionId: o.subscriptionId ?? null,
          polarProductId: o.productId ?? null,
          polarStatus: o.subscription?.status ?? null,
          currentPeriodEnd: toDate(o.subscription?.currentPeriodEnd),
          gracePeriodEndsAt: null,
          readOnlyAt: null,
        },
      };
    }

    case "customer.state_changed":
      return reconcileCustomerState(event.data as CustomerStateData, current, now, workspaceId);

    // Informational and refund events: recorded for audit, no entitlement change
    // (refunds defer to the accompanying subscription event).
    case "checkout.created":
    case "checkout.updated":
    case "order.refunded":
      return { workspaceId, write: null };

    // Unknown / unhandled type: record + ack, never crash.
    default:
      return { workspaceId, write: null };
  }
}

/**
 * Apply a computed `BillingDecision` to `WorkspaceBilling` (upsert). The single
 * home for the create/update field set — `externalCustomerId` seeding and the
 * `lastSyncedAt` stamp — so the webhook orchestrator and the PR 6 reconcile
 * passes write rows identically. A record-only decision (`write: null`) or an
 * unresolved workspace is a no-op.
 *
 * Accepts either the `PrismaClient` or a transaction client, so callers can run
 * it standalone (reconcile drift) or inside an existing transaction (webhook
 * apply / failed-event retry).
 *
 * @param eventId when set, records the originating event id in
 *   `lastWebhookEventId` (webhook apply and failed-event retry); omit for drift
 *   reconciliation, which is not tied to a single delivery.
 */
export async function applyBillingDecision(
  db: Prisma.TransactionClient,
  decision: BillingDecision,
  now: Date,
  eventId?: string | null,
): Promise<void> {
  if (!decision.workspaceId || !decision.write) return;

  const sync = eventId
    ? { lastSyncedAt: now, lastWebhookEventId: eventId }
    : { lastSyncedAt: now };

  await db.workspaceBilling.upsert({
    where: { workspaceId: decision.workspaceId },
    create: {
      workspaceId: decision.workspaceId,
      externalCustomerId: decision.workspaceId,
      ...decision.write,
      ...sync,
    },
    update: {
      ...decision.write,
      ...sync,
    },
  });
}

export interface ProcessOptions {
  /** Raw webhook JSON to persist for replay (defaults to the validated event). */
  rawPayload?: unknown;
  /** Injectable clock (tests). */
  now?: Date;
  /** Injectable Prisma client (tests). */
  db?: PrismaClient;
}

export interface ProcessResult {
  /** Event id already seen — re-delivery, no side effects re-run. */
  duplicate: boolean;
  /** State change committed and processedAt set. */
  processed: boolean;
  workspaceId: string | null;
  /** Side-effect error, if processing failed (left for reconcile to retry). */
  error?: string;
}

function isUniqueConflict(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}

/**
 * Idempotently record and apply a webhook event. Always safe to call again with
 * the same `eventId` — the second call returns `{ duplicate: true }` without
 * re-running side effects. Never throws on a side-effect failure: it stores the
 * error and returns `{ processed: false }` so the route can still ack 200 and
 * PR 6 reconcile can retry.
 */
export async function processWebhookEvent(
  event: WebhookEvent,
  eventId: string,
  opts: ProcessOptions = {},
): Promise<ProcessResult> {
  const { rawPayload = event, now = new Date(), db = prisma } = opts;
  const workspaceId = resolveWorkspaceId(event);

  // Side-effect error captured inside the transaction (apply failed but the
  // recorded event was still committed). Read after the transaction commits.
  let applyError: string | undefined;

  // The whole first-seen path is one transaction:
  //   (1) INSERT BillingEvent (keyed by polarEventId). A unique conflict means
  //       we've already seen this delivery — the create throws P2002, the tx
  //       rolls back, and the outer catch turns it into a duplicate ack.
  //   (2) apply the WorkspaceBilling state change, then (3) set processedAt.
  // Steps (2)+(3) run inside a SAVEPOINT: if applying fails we roll back only
  // that step and record the error, leaving the inserted event committed with
  // processedAt null for PR 6 reconcile to retry.
  try {
    await db.$transaction(async (tx) => {
      await tx.billingEvent.create({
        data: {
          polarEventId: eventId,
          type: event.type,
          workspaceId,
          payload: rawPayload as Prisma.InputJsonValue,
        },
      });

      try {
        await tx.$executeRawUnsafe("SAVEPOINT apply_state");

        const current = workspaceId
          ? await tx.workspaceBilling.findUnique({
              where: { workspaceId },
              select: { status: true },
            })
          : null;

        const decision = computeBillingUpdate(event, current, now);

        await applyBillingDecision(tx, decision, now, eventId);

        await tx.billingEvent.update({
          where: { polarEventId: eventId },
          data: { processedAt: now, error: null },
        });
      } catch (err) {
        // Apply failed: undo only the aborted step so the recorded event
        // survives, then store the error with processedAt left null.
        applyError = err instanceof Error ? err.message : String(err);
        await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT apply_state");
        await tx.billingEvent.update({
          where: { polarEventId: eventId },
          data: { error: applyError, processedAt: null },
        });
      }
    });
  } catch (err) {
    if (isUniqueConflict(err)) {
      return { duplicate: true, processed: false, workspaceId };
    }
    throw err;
  }

  if (applyError) {
    return { duplicate: false, processed: false, workspaceId, error: applyError };
  }
  return { duplicate: false, processed: true, workspaceId };
}
