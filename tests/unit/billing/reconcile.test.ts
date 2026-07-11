import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { PrismaClient, type Prisma } from "@prisma/client";
import { setupTestWorkspace } from "@/tests/integration/helpers/workspace";
import { runBillingReconcile, type PolarCustomerGateway } from "@/lib/billing/reconcile";

// reconcile.ts is Prisma-coupled (updateMany / groupBy / $transaction), so the
// three passes are exercised against the test database with an injected clock
// and Polar gateway — the same `{ db, now, polarCustomers }` seams the worker
// exposes for exactly this. The pure event→state mapping it reuses is covered
// in tests/unit/billing/webhook-handlers.test.ts; here we test the worker's own
// behaviour: time transitions, failed-event retry, and drift convergence.

const prisma = new PrismaClient();
const NOW = new Date("2026-05-27T12:00:00.000Z");

let workspaceId: string;

beforeEach(async () => {
  // billing_events has no FK, so setupTestWorkspace (which cascades
  // workspace_billing via the workspace delete) doesn't clear it — do it here.
  await prisma.billingEvent.deleteMany();
  const seed = await setupTestWorkspace(prisma);
  await prisma.billingEvent.deleteMany();
  workspaceId = seed.workspaceId;
});

afterAll(async () => {
  await prisma.$disconnect();
});

function seedBilling(data: Omit<Prisma.WorkspaceBillingUncheckedCreateInput, "workspaceId">) {
  return prisma.workspaceBilling.create({ data: { workspaceId, ...data } });
}

function getBilling() {
  return prisma.workspaceBilling.findUniqueOrThrow({ where: { workspaceId } });
}

describe("runBillingReconcile — time transitions (pass 2)", () => {
  it("PAST_DUE: just before gracePeriodEndsAt stays PAST_DUE; at/after flips READ_ONLY + stamps readOnlyAt", async () => {
    const grace = new Date("2026-06-07T12:00:00.000Z");
    // No polarCustomerId ⇒ the drift pass skips this row; polarCustomers null
    // skips pass 3 entirely. No pending events ⇒ pass 1 is a no-op. So this
    // isolates the clock-driven transition.
    await seedBilling({ status: "PAST_DUE", gracePeriodEndsAt: grace });

    // Just before the deadline: no transition.
    const before = await runBillingReconcile({
      db: prisma,
      now: new Date(grace.getTime() - 1000),
      polarCustomers: null,
    });
    let row = await getBilling();
    expect(row.status).toBe("PAST_DUE");
    expect(row.readOnlyAt).toBeNull();
    expect(before.transitions.pastDueToReadOnly).toBe(0);

    // At the deadline: lapse to READ_ONLY and stamp readOnlyAt = now.
    const at = new Date(grace.getTime());
    const res = await runBillingReconcile({ db: prisma, now: at, polarCustomers: null });
    row = await getBilling();
    expect(row.status).toBe("READ_ONLY");
    expect(row.readOnlyAt).toEqual(at);
    expect(res.transitions.pastDueToReadOnly).toBe(1);
    // The transition is a successful reconcile: lastSyncedAt is stamped so the
    // health snapshot reports a non-null age even on a transition-only run.
    expect(row.lastSyncedAt).toEqual(at);
    expect(res.health.lastSuccessfulReconcileAt).toEqual(at);
  });

  it("CANCELED: just before currentPeriodEnd stays CANCELED; at/after flips READ_ONLY + stamps readOnlyAt", async () => {
    const periodEnd = new Date("2026-06-07T12:00:00.000Z");
    await seedBilling({ status: "CANCELED", currentPeriodEnd: periodEnd });

    // Just before the paid period ends: entitlements persist, status unchanged.
    const before = await runBillingReconcile({
      db: prisma,
      now: new Date(periodEnd.getTime() - 1000),
      polarCustomers: null,
    });
    let row = await getBilling();
    expect(row.status).toBe("CANCELED");
    expect(row.readOnlyAt).toBeNull();
    expect(before.transitions.canceledToReadOnly).toBe(0);

    // At period end: default stop ⇒ READ_ONLY.
    const at = new Date(periodEnd.getTime());
    const res = await runBillingReconcile({ db: prisma, now: at, polarCustomers: null });
    row = await getBilling();
    expect(row.status).toBe("READ_ONLY");
    expect(row.readOnlyAt).toEqual(at);
    expect(res.transitions.canceledToReadOnly).toBe(1);
    // Clock-driven lock counts as a successful reconcile ⇒ lastSyncedAt stamped.
    expect(row.lastSyncedAt).toEqual(at);
    expect(res.health.lastSuccessfulReconcileAt).toEqual(at);
  });

  it("TRIALING past trialEndsAt is flagged but NOT locally changed (Polar owns trial-end truth)", async () => {
    await seedBilling({
      status: "TRIALING",
      trialEndsAt: new Date("2026-05-01T00:00:00.000Z"), // before NOW
    });

    const res = await runBillingReconcile({ db: prisma, now: NOW, polarCustomers: null });

    const row = await getBilling();
    expect(row.status).toBe("TRIALING");
    expect(row.readOnlyAt).toBeNull();
    expect(res.transitions.trialExpiredFlagged).toBe(1);
    // Flagged only, not changed ⇒ no lastSyncedAt stamp (Polar owns the truth).
    expect(row.lastSyncedAt).toBeNull();
  });
});

describe("runBillingReconcile — failed-event retry (pass 1)", () => {
  it("a pending event applies once, marks processedAt; a second run does not reprocess and state is stable", async () => {
    // A webhook recorded this event but its apply step failed (processedAt null,
    // error stored) — exactly the row PR 6 reconcile is meant to retry. This
    // case uses an already-camelCase { type, data } payload (the normalizer is
    // idempotent on it); the next test proves the raw snake_case wire shape.
    const payload = {
      type: "subscription.active",
      data: {
        id: "sub_1",
        customerId: "cus_1",
        productId: "prod_1",
        status: "active",
        currentPeriodEnd: new Date("2026-07-01T00:00:00.000Z").toISOString(),
        prices: [{ id: "price_1" }],
        customer: { id: "cus_1", externalId: workspaceId },
        metadata: { workspaceId },
      },
    };
    await prisma.billingEvent.create({
      data: {
        polarEventId: "evt_retry_1",
        type: "subscription.active",
        workspaceId,
        payload: payload as Prisma.InputJsonValue,
        error: "boom: prior apply failed",
      },
    });

    // First run: the stored event replays and applies once.
    const first = await runBillingReconcile({ db: prisma, now: NOW, polarCustomers: null });
    expect(first.retriedEvents).toMatchObject({ attempted: 1, processed: 1, stillFailing: 0 });

    const row = await getBilling();
    expect(row.status).toBe("ACTIVE");
    expect(row.lastWebhookEventId).toBe("evt_retry_1");

    const ev = await prisma.billingEvent.findUniqueOrThrow({ where: { polarEventId: "evt_retry_1" } });
    expect(ev.processedAt).not.toBeNull();
    expect(ev.error).toBeNull();

    // Second run an hour later: the event is no longer pending, nothing is
    // retried, and the applied state is unchanged (idempotent backstop).
    const second = await runBillingReconcile({
      db: prisma,
      now: new Date(NOW.getTime() + 3_600_000),
      polarCustomers: null,
    });
    expect(second.retriedEvents.attempted).toBe(0);
    expect(second.retriedEvents.processed).toBe(0);

    const rowAfter = await getBilling();
    expect(rowAfter.status).toBe("ACTIVE");
    expect(rowAfter.lastWebhookEventId).toBe("evt_retry_1");

    const evAfter = await prisma.billingEvent.findUniqueOrThrow({ where: { polarEventId: "evt_retry_1" } });
    expect(evAfter.processedAt).toEqual(ev.processedAt); // not re-stamped
  });

  it("replays from the raw stored event JSON (Polar's snake_case wire shape), normalising to a clean apply", async () => {
    // What the webhook route actually persists: the original event JSON in
    // Polar's snake_case form (customer_id, current_period_end, external_id…).
    // computeBillingUpdate reads camelCase, so retry must normalise first.
    // Without normalisation these fields would read as undefined and the row
    // would land with null customer/subscription/period — the assertions below
    // would fail. With it, the raw payload applies exactly like the live event.
    const periodEnd = new Date("2026-07-01T00:00:00.000Z");
    const rawPayload = {
      type: "subscription.active",
      data: {
        id: "sub_raw",
        customer_id: "cus_raw",
        product_id: "prod_raw",
        status: "active",
        current_period_end: periodEnd.toISOString(),
        cancel_at_period_end: false,
        canceled_at: null,
        prices: [{ id: "price_raw" }],
        customer: { id: "cus_raw", external_id: workspaceId },
        metadata: { workspaceId },
      },
    };
    await prisma.billingEvent.create({
      data: {
        polarEventId: "evt_raw_1",
        type: "subscription.active",
        workspaceId,
        payload: rawPayload as Prisma.InputJsonValue,
        error: "boom: prior apply failed",
      },
    });

    const res = await runBillingReconcile({ db: prisma, now: NOW, polarCustomers: null });
    expect(res.retriedEvents).toMatchObject({ attempted: 1, processed: 1, stillFailing: 0 });

    const row = await getBilling();
    expect(row.status).toBe("ACTIVE");
    // Snake_case fields survived the round-trip → camelCase mapping.
    expect(row.polarCustomerId).toBe("cus_raw");
    expect(row.polarSubscriptionId).toBe("sub_raw");
    expect(row.polarProductId).toBe("prod_raw");
    expect(row.polarPriceId).toBe("price_raw");
    expect(row.currentPeriodEnd).toEqual(periodEnd);
    expect(row.lastWebhookEventId).toBe("evt_raw_1");

    const ev = await prisma.billingEvent.findUniqueOrThrow({ where: { polarEventId: "evt_raw_1" } });
    expect(ev.processedAt).not.toBeNull();
    expect(ev.error).toBeNull();
  });
});

describe("runBillingReconcile — drift reconciliation (pass 3)", () => {
  /** A fake gateway returning a customer.state_changed-style snapshot. */
  function gatewayReturning(state: Record<string, unknown>): PolarCustomerGateway {
    return {
      // The worker addresses Polar by external_customer_id (== workspaceId); we
      // echo it back as `externalId` so the snapshot resolves to this workspace.
      getStateExternal: async ({ externalId }) =>
        ({ externalId, ...state }) as never,
    };
  }

  it("a drifted READ_ONLY row converges to ACTIVE from the live snapshot", async () => {
    await seedBilling({ status: "READ_ONLY", readOnlyAt: NOW, polarCustomerId: "cus_1" });

    const res = await runBillingReconcile({
      db: prisma,
      now: NOW,
      polarCustomers: gatewayReturning({
        id: "cus_1",
        activeSubscriptions: [
          {
            id: "sub_1",
            productId: "prod_1",
            status: "active",
            currentPeriodEnd: new Date("2026-07-01T00:00:00.000Z"),
            trialEnd: null,
            cancelAtPeriodEnd: false,
            canceledAt: null,
          },
        ],
      }),
    });

    const row = await getBilling();
    expect(row.status).toBe("ACTIVE");
    expect(row.gracePeriodEndsAt).toBeNull();
    expect(row.readOnlyAt).toBeNull();
    expect(res.drift).toMatchObject({ checked: 1, reconciled: 1, failed: 0, skipped: 0 });
  });

  it("a snapshot carrying a trialing subscription converges the row to TRIALING", async () => {
    await seedBilling({ status: "NONE", polarCustomerId: "cus_2" });
    const trialEnd = new Date("2026-06-10T00:00:00.000Z");

    const res = await runBillingReconcile({
      db: prisma,
      now: NOW,
      polarCustomers: gatewayReturning({
        id: "cus_2",
        activeSubscriptions: [{ id: "sub_2", productId: "prod_1", status: "trialing", trialEnd }],
      }),
    });

    const row = await getBilling();
    expect(row.status).toBe("TRIALING");
    expect(row.trialEndsAt).toEqual(trialEnd);
    expect(res.drift.reconciled).toBe(1);
  });
});
