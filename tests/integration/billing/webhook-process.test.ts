import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { setupTestWorkspace } from "@/tests/integration/helpers/workspace";
import {
  processWebhookEvent,
  GRACE_PERIOD_DAYS,
  type WebhookEvent,
} from "@/lib/billing/webhook-handlers";

// DB-backed tests for the idempotent orchestrator. These exercise the real
// record → apply → mark-processed transaction against the test database; the
// pure mapping is covered separately in tests/unit/billing/webhook-handlers.test.ts.

const prisma = new PrismaClient();
const NOW = new Date("2026-05-27T12:00:00.000Z");

let workspaceId: string;

beforeEach(async () => {
  // setupTestWorkspace wipes workspaces (cascading workspace_billing); billing_events
  // has no FK so it must be cleared explicitly.
  await prisma.billingEvent.deleteMany();
  const seed = await setupTestWorkspace(prisma);
  await prisma.billingEvent.deleteMany();
  workspaceId = seed.workspaceId;
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** A subscription-shaped event targeting the seeded workspace via metadata. */
function subEvent(type: string, data: Record<string, unknown> = {}): WebhookEvent {
  return {
    type,
    data: {
      id: "sub_1",
      customerId: "cus_1",
      productId: "prod_1",
      status: "active",
      currentPeriodEnd: new Date("2026-07-01T00:00:00.000Z"),
      trialEnd: null,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      prices: [{ id: "price_1" }],
      customer: { id: "cus_1", externalId: workspaceId },
      metadata: { workspaceId },
      ...data,
    },
  };
}

function run(event: WebhookEvent, eventId: string) {
  return processWebhookEvent(event, eventId, { db: prisma, now: NOW });
}

describe("processWebhookEvent — idempotency", () => {
  it("same polarEventId twice ⇒ one BillingEvent row, one state change", async () => {
    const event = subEvent("subscription.active");

    const first = await run(event, "evt_dup_1");
    expect(first).toMatchObject({ duplicate: false, processed: true, workspaceId });

    const second = await run(event, "evt_dup_1");
    expect(second).toMatchObject({ duplicate: true, processed: false, workspaceId });

    const events = await prisma.billingEvent.findMany({ where: { polarEventId: "evt_dup_1" } });
    expect(events).toHaveLength(1);
    expect(events[0].processedAt).not.toBeNull();

    const billing = await prisma.workspaceBilling.findUnique({ where: { workspaceId } });
    expect(billing?.status).toBe("ACTIVE");
    // The re-delivery never re-ran side effects, so the applied event id is the
    // single original delivery.
    expect(billing?.lastWebhookEventId).toBe("evt_dup_1");
  });
});

describe("processWebhookEvent — out-of-order delivery (last-write-wins)", () => {
  it("revoked then late active ⇒ final status ACTIVE, grace cleared", async () => {
    await run(subEvent("subscription.revoked"), "evt_revoked");

    const afterRevoke = await prisma.workspaceBilling.findUnique({ where: { workspaceId } });
    expect(afterRevoke?.status).toBe("PAST_DUE");
    const expectedGrace = new Date(NOW.getTime() + GRACE_PERIOD_DAYS * 86_400_000);
    expect(afterRevoke?.gracePeriodEndsAt).toEqual(expectedGrace);

    // A late-arriving "active" carries the absolute current state and must win.
    await run(subEvent("subscription.active"), "evt_active_late");

    const final = await prisma.workspaceBilling.findUnique({ where: { workspaceId } });
    expect(final?.status).toBe("ACTIVE");
    expect(final?.gracePeriodEndsAt).toBeNull();
    expect(final?.readOnlyAt).toBeNull();
  });
});

describe("processWebhookEvent — unknown event type", () => {
  it("records the event, sets processedAt, no crash, no WorkspaceBilling state change", async () => {
    const event: WebhookEvent = {
      type: "subscription.paused",
      data: { metadata: { workspaceId } },
    };

    const result = await run(event, "evt_unknown");
    expect(result).toMatchObject({ duplicate: false, processed: true, workspaceId });

    const recorded = await prisma.billingEvent.findUnique({ where: { polarEventId: "evt_unknown" } });
    expect(recorded?.type).toBe("subscription.paused");
    expect(recorded?.processedAt).not.toBeNull();

    // Record-only ⇒ no row is created/changed for the workspace.
    const billing = await prisma.workspaceBilling.findUnique({ where: { workspaceId } });
    expect(billing).toBeNull();
  });
});

describe("processWebhookEvent — apply failure (PR 6 retry seam)", () => {
  it("commits the recorded event with error + null processedAt when the state change fails", async () => {
    // Route the event at a workspace that doesn't exist: the WorkspaceBilling
    // upsert violates the workspaceId FK, so the apply step fails. billing_events
    // has no FK, so the recorded event must still commit (inside the same
    // transaction's savepoint) for PR 6 reconcile to retry.
    const missingWs = "ws_does_not_exist";
    const event = subEvent("subscription.active", {
      customer: { id: "cus_1", externalId: missingWs },
      metadata: { workspaceId: missingWs },
    });

    const result = await run(event, "evt_apply_fail");
    expect(result).toMatchObject({ duplicate: false, processed: false, workspaceId: missingWs });
    expect(result.error).toBeTruthy();

    const recorded = await prisma.billingEvent.findUnique({ where: { polarEventId: "evt_apply_fail" } });
    expect(recorded).not.toBeNull();
    expect(recorded?.processedAt).toBeNull();
    expect(recorded?.error).toBeTruthy();

    // No partial WorkspaceBilling row leaked for the missing workspace.
    const billing = await prisma.workspaceBilling.findUnique({ where: { workspaceId: missingWs } });
    expect(billing).toBeNull();
  });
});

describe("processWebhookEvent — full lifecycle replay", () => {
  it("created(trialing) → active → canceled → revoked → uncanceled", async () => {
    const trialEnd = new Date("2026-06-10T00:00:00.000Z");

    await run(subEvent("subscription.created", { status: "trialing", trialEnd }), "evt_created");
    let billing = await prisma.workspaceBilling.findUnique({ where: { workspaceId } });
    expect(billing?.status).toBe("TRIALING");
    expect(billing?.trialEndsAt).toEqual(trialEnd);

    await run(subEvent("subscription.active"), "evt_active");
    billing = await prisma.workspaceBilling.findUnique({ where: { workspaceId } });
    expect(billing?.status).toBe("ACTIVE");

    const canceledAt = new Date("2026-06-15T00:00:00.000Z");
    await run(subEvent("subscription.canceled", { canceledAt }), "evt_canceled");
    billing = await prisma.workspaceBilling.findUnique({ where: { workspaceId } });
    expect(billing?.status).toBe("CANCELED");
    expect(billing?.cancelAtPeriodEnd).toBe(true);

    await run(subEvent("subscription.revoked"), "evt_revoked");
    billing = await prisma.workspaceBilling.findUnique({ where: { workspaceId } });
    expect(billing?.status).toBe("PAST_DUE");
    expect(billing?.gracePeriodEndsAt).toEqual(
      new Date(NOW.getTime() + GRACE_PERIOD_DAYS * 86_400_000),
    );

    await run(subEvent("subscription.uncanceled"), "evt_uncanceled");
    billing = await prisma.workspaceBilling.findUnique({ where: { workspaceId } });
    expect(billing?.status).toBe("ACTIVE");
    expect(billing?.cancelAtPeriodEnd).toBe(false);
    expect(billing?.canceledAt).toBeNull();
    expect(billing?.gracePeriodEndsAt).toBeNull();

    // Five distinct deliveries ⇒ five recorded events, all processed.
    const events = await prisma.billingEvent.findMany({ where: { workspaceId } });
    expect(events).toHaveLength(5);
    expect(events.every((e) => e.processedAt !== null)).toBe(true);
  });
});
