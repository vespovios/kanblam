/**
 * Billing reconcile worker — the periodic backstop that keeps
 * `WorkspaceBilling` correct when the live webhook path missed, failed, or fell
 * behind. Runs hourly from the `reconcile-billing` cron (see
 * `app/api/cron/reconcile-billing/route.ts`); pure server-side, no UI, no
 * analytics.
 *
 * It is **injectable and side-effect-honest**: pass a Prisma client, a clock,
 * and (optionally) a Polar customer gateway, and the same three passes run
 * deterministically against a test database with a fake clock.
 *
 * Three passes, in order:
 *
 *   1. **Retry failed events.** Every `BillingEvent` with `processedAt = null`
 *      (a webhook whose apply step failed and was left for retry) is replayed
 *      through `computeBillingUpdate` against its stored **raw** event JSON
 *      (normalised back to a validated-shaped event by `normalizeStoredEvent`),
 *      then marked processed. Replaying the absolute state the event carries
 *      makes this idempotent and last-write-wins, exactly like the live webhook
 *      orchestrator.
 *   2. **Time transitions.** Lifecycle deadlines the webhook layer deliberately
 *      does not flip itself:
 *        - `PAST_DUE` past `gracePeriodEndsAt`   ⇒ `READ_ONLY` (+ `readOnlyAt`).
 *        - `CANCELED` past `currentPeriodEnd`     ⇒ `READ_ONLY` (+ `readOnlyAt`).
 *        - `TRIALING` past `trialEndsAt`          ⇒ **flagged only**. Trial-end
 *          truth lives in Polar (the card may have converted to a paid sub);
 *          we never lock locally on the clock — pass 3 reconciles it from the
 *          authoritative customer state.
 *   3. **Drift reconciliation.** For every row with a `polarCustomerId`, fetch
 *      the current Polar customer state and apply it through the existing
 *      `customer.state_changed` repair logic (`computeBillingUpdate`), so any
 *      drift from missed/out-of-order webhooks converges to Polar's truth.
 *
 * Ends with a server-side health `console.log`: status histogram, pending
 * event backlog, and age of the last successful reconcile.
 *
 * See `the billing design notes (2026-05-24, private archive)` → PR 6.
 */

import type { BillingStatus, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getPolarClient } from "@/lib/billing/polar";
import {
  applyBillingDecision,
  computeBillingUpdate,
  resolveWorkspaceId,
  type CustomerStateData,
  type WebhookEvent,
} from "@/lib/billing/webhook-handlers";

/**
 * The slice of Polar's `customers` API the drift pass needs. Kept structural so
 * the real `getPolarClient().customers` satisfies it, and tests can pass a stub.
 */
export interface PolarCustomerGateway {
  getStateExternal(request: { externalId: string }): Promise<CustomerStateData>;
}

export interface ReconcileOptions {
  /** Injectable Prisma client (tests). */
  db?: PrismaClient;
  /** Injectable clock (tests). */
  now?: Date;
  /**
   * Injectable Polar customer gateway. Omit to use the shared client; pass
   * `null` to skip the drift pass entirely (e.g. billing unconfigured).
   */
  polarCustomers?: PolarCustomerGateway | null;
}

export interface RetryStats {
  attempted: number;
  processed: number;
  stillFailing: number;
}

export interface TransitionStats {
  pastDueToReadOnly: number;
  canceledToReadOnly: number;
  /** TRIALING rows past trialEndsAt — flagged for drift, not locally changed. */
  trialExpiredFlagged: number;
}

export interface DriftStats {
  checked: number;
  reconciled: number;
  failed: number;
  /** Rows skipped because no Polar gateway was available. */
  skipped: number;
}

export interface BillingHealth {
  /** Count of `WorkspaceBilling` rows by `BillingStatus`. */
  statusCounts: Partial<Record<BillingStatus, number>>;
  /** `BillingEvent` rows still awaiting a successful apply. */
  pendingEvents: number;
  /** Most recent successful reconcile/webhook apply, or null if none yet. */
  lastSuccessfulReconcileAt: Date | null;
  /** Age of that last reconcile in ms (null when none recorded). */
  lastSuccessfulReconcileAgeMs: number | null;
}

export interface ReconcileResult {
  retriedEvents: RetryStats;
  transitions: TransitionStats;
  drift: DriftStats;
  health: BillingHealth;
}

/**
 * Replay-normalise a stored `BillingEvent.payload` back into a `WebhookEvent`.
 *
 * The webhook route persists the **raw** event JSON — Polar's snake_case wire
 * shape, the durable record of what was actually sent (and, for the route's
 * parse-failure fallback, possibly a raw string). `computeBillingUpdate` reads
 * the SDK-normalised camelCase field names, so the retry pass converts the
 * stored payload before replaying it:
 *
 *   - A raw string is JSON-parsed first; an unparseable one yields an
 *     empty-typed event that maps to a record-only no-op (never throws).
 *   - The payload is already `{ type, data }` (both raw and SDK shapes are), so
 *     we keep `type` and deep-convert the `data` keys snake_case → camelCase.
 *     That conversion is idempotent on already-camelCase keys, so a backlog
 *     mixing raw payloads and any older validated-event rows replays uniformly.
 *
 * Date strings are left as-is — `computeBillingUpdate`'s `toDate` already
 * accepts ISO strings as well as `Date`s.
 */
function snakeToCamelKey(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

function camelizeKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelizeKeys);
  if (value !== null && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[snakeToCamelKey(k)] = camelizeKeys(v);
    }
    return out;
  }
  return value;
}

export function normalizeStoredEvent(payload: unknown): WebhookEvent {
  let value: unknown = payload;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return { type: "", data: {} };
    }
  }
  if (value === null || typeof value !== "object") return { type: "", data: {} };

  const obj = value as { type?: unknown; data?: unknown };
  return {
    type: typeof obj.type === "string" ? obj.type : "",
    data: camelizeKeys(obj.data ?? {}),
  };
}

/**
 * Pass 1 — replay every unprocessed `BillingEvent` through the pure mapper and
 * mark it processed. Each replay runs in its own transaction so one poison event
 * doesn't roll back the rest; a still-failing apply leaves `processedAt` null and
 * refreshes the stored error for the next run to retry.
 */
async function retryFailedEvents(db: PrismaClient, now: Date): Promise<RetryStats> {
  const pending = await db.billingEvent.findMany({
    where: { processedAt: null },
    orderBy: { receivedAt: "asc" },
    select: { id: true, polarEventId: true, payload: true },
  });

  let processed = 0;
  let stillFailing = 0;

  for (const ev of pending) {
    // The stored payload is the raw event JSON the webhook persisted; normalise
    // it back to a validated-shaped { type, data } event before replaying.
    const event = normalizeStoredEvent(ev.payload);
    try {
      await db.$transaction(async (tx) => {
        const workspaceId = resolveWorkspaceId(event);
        const current = workspaceId
          ? await tx.workspaceBilling.findUnique({
              where: { workspaceId },
              select: { status: true },
            })
          : null;

        const decision = computeBillingUpdate(event, current, now);
        await applyBillingDecision(tx, decision, now, ev.polarEventId);

        await tx.billingEvent.update({
          where: { id: ev.id },
          data: { processedAt: now, error: null },
        });
      });
      processed++;
    } catch (err) {
      stillFailing++;
      const message = err instanceof Error ? err.message : String(err);
      // Refresh the stored error; leave processedAt null so we retry next run.
      await db.billingEvent
        .update({ where: { id: ev.id }, data: { error: message } })
        .catch(() => {
          /* best-effort: never let bookkeeping mask the original failure */
        });
    }
  }

  return { attempted: pending.length, processed, stillFailing };
}

/**
 * Pass 2 — apply the clock-driven lifecycle transitions the webhook layer leaves
 * to reconcile. PAST_DUE and CANCELED lapse to READ_ONLY at their deadline;
 * expired trials are only counted (trial-end truth is reconciled from Polar in
 * pass 3, never locked locally on the clock).
 */
async function applyTimeTransitions(db: PrismaClient, now: Date): Promise<TransitionStats> {
  // PAST_DUE whose grace window has elapsed ⇒ lock read-only (D2). Stamp
  // lastSyncedAt so this clock-driven change counts as a successful reconcile
  // in the health snapshot (a run that only transitions still synced state).
  const pastDue = await db.workspaceBilling.updateMany({
    where: { status: "PAST_DUE", gracePeriodEndsAt: { lte: now } },
    data: { status: "READ_ONLY", readOnlyAt: now, lastSyncedAt: now },
  });

  // CANCELED whose paid period has ended ⇒ lock read-only (D3 default stop).
  const canceled = await db.workspaceBilling.updateMany({
    where: { status: "CANCELED", currentPeriodEnd: { lte: now } },
    data: { status: "READ_ONLY", readOnlyAt: now, lastSyncedAt: now },
  });

  // TRIALING past trialEndsAt: flag only. Polar owns whether the card converted.
  const trialExpiredFlagged = await db.workspaceBilling.count({
    where: { status: "TRIALING", trialEndsAt: { lte: now } },
  });

  return {
    pastDueToReadOnly: pastDue.count,
    canceledToReadOnly: canceled.count,
    trialExpiredFlagged,
  };
}

/**
 * Pass 3 — fetch each Polar-linked customer's current state and reconcile the
 * row through the same `customer.state_changed` repair path the webhook uses, so
 * missed/out-of-order events converge to Polar's truth. Per-row isolation: one
 * fetch failure is recorded and skipped, not fatal to the run.
 */
async function reconcileDrift(
  db: PrismaClient,
  now: Date,
  polarCustomers: PolarCustomerGateway | null,
): Promise<DriftStats> {
  const rows = await db.workspaceBilling.findMany({
    where: { polarCustomerId: { not: null } },
    select: { workspaceId: true },
  });

  if (!polarCustomers) {
    return { checked: rows.length, reconciled: 0, failed: 0, skipped: rows.length };
  }

  let reconciled = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      // We address Polar by external_customer_id (== workspaceId), set at checkout.
      const state = await polarCustomers.getStateExternal({ externalId: row.workspaceId });
      const event: WebhookEvent = { type: "customer.state_changed", data: state };

      await db.$transaction(async (tx) => {
        const current = await tx.workspaceBilling.findUnique({
          where: { workspaceId: row.workspaceId },
          select: { status: true },
        });
        const decision = computeBillingUpdate(event, current, now);
        // No eventId: drift reconciliation isn't tied to a single delivery.
        await applyBillingDecision(tx, decision, now);
      });
      reconciled++;
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      console.error("[billing] drift reconcile failed", {
        workspaceId: row.workspaceId,
        error: message,
      });
    }
  }

  return { checked: rows.length, reconciled, failed, skipped: 0 };
}

/** End-of-run health snapshot for the cron logs (server-side only). */
async function billingHealth(db: PrismaClient, now: Date): Promise<BillingHealth> {
  const grouped = await db.workspaceBilling.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  const statusCounts: Partial<Record<BillingStatus, number>> = {};
  for (const g of grouped) statusCounts[g.status] = g._count._all;

  const pendingEvents = await db.billingEvent.count({ where: { processedAt: null } });

  const lastSync = await db.workspaceBilling.aggregate({ _max: { lastSyncedAt: true } });
  const lastSuccessfulReconcileAt = lastSync._max.lastSyncedAt ?? null;
  const lastSuccessfulReconcileAgeMs = lastSuccessfulReconcileAt
    ? now.getTime() - lastSuccessfulReconcileAt.getTime()
    : null;

  return {
    statusCounts,
    pendingEvents,
    lastSuccessfulReconcileAt,
    lastSuccessfulReconcileAgeMs,
  };
}

/**
 * Run the full reconcile sweep. Safe to call repeatedly: every pass computes
 * absolute target state, so a second run with no new drift is a no-op. Defaults
 * to the shared Prisma client, the real clock, and the shared Polar client's
 * customer gateway (or no drift pass when billing is unconfigured).
 */
export async function runBillingReconcile(opts: ReconcileOptions = {}): Promise<ReconcileResult> {
  const now = opts.now ?? new Date();
  const db = opts.db ?? prisma;
  const polarCustomers =
    opts.polarCustomers !== undefined
      ? opts.polarCustomers
      : (getPolarClient()?.customers as PolarCustomerGateway | undefined) ?? null;

  const retriedEvents = await retryFailedEvents(db, now);
  const transitions = await applyTimeTransitions(db, now);
  const drift = await reconcileDrift(db, now, polarCustomers);
  const health = await billingHealth(db, now);

  // Server-side health line for the hourly cron logs. No analytics, no UI.
  console.log("[billing] reconcile complete", {
    statusCounts: health.statusCounts,
    pendingEvents: health.pendingEvents,
    lastSuccessfulReconcileAgeMs: health.lastSuccessfulReconcileAgeMs,
    retriedEvents,
    transitions,
    drift,
  });

  return { retriedEvents, transitions, drift, health };
}
