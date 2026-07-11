import { describe, it, expect } from "vitest";
import {
  computeBillingUpdate,
  resolveWorkspaceId,
  GRACE_PERIOD_DAYS,
  type WebhookEvent,
  type CurrentBilling,
} from "@/lib/billing/webhook-handlers";

const WS = "ws_test_1";
const NOW = new Date("2026-05-27T12:00:00.000Z");

/** A subscription-shaped event with sensible defaults; override the data. */
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
      customer: { id: "cus_1", externalId: WS },
      metadata: { workspaceId: WS },
      ...data,
    },
  };
}

describe("resolveWorkspaceId", () => {
  it("reads metadata.workspaceId first", () => {
    expect(resolveWorkspaceId({ type: "x", data: { metadata: { workspaceId: WS } } })).toBe(WS);
  });

  it("falls back to customer.externalId", () => {
    expect(resolveWorkspaceId({ type: "x", data: { customer: { externalId: WS } } })).toBe(WS);
  });

  it("falls back to top-level externalId (customer.state_changed)", () => {
    expect(resolveWorkspaceId({ type: "x", data: { externalId: WS } })).toBe(WS);
  });

  it("returns null when nothing resolves", () => {
    expect(resolveWorkspaceId({ type: "x", data: {} })).toBeNull();
  });
});

describe("computeBillingUpdate — subscription lifecycle", () => {
  it("subscription.created without trial ⇒ NONE, ids mirrored", () => {
    const d = computeBillingUpdate(subEvent("subscription.created", { status: "incomplete" }), null, NOW);
    expect(d.workspaceId).toBe(WS);
    expect(d.write?.status).toBe("NONE");
    expect(d.write?.trialEndsAt).toBeNull();
    expect(d.write?.polarSubscriptionId).toBe("sub_1");
    expect(d.write?.polarCustomerId).toBe("cus_1");
    expect(d.write?.polarProductId).toBe("prod_1");
    expect(d.write?.polarPriceId).toBe("price_1");
  });

  it("subscription.created with a trial ⇒ TRIALING + trialEndsAt (D1)", () => {
    const trialEnd = new Date("2026-06-10T00:00:00.000Z");
    const d = computeBillingUpdate(
      subEvent("subscription.created", { status: "trialing", trialEnd }),
      null,
      NOW,
    );
    expect(d.write?.status).toBe("TRIALING");
    expect(d.write?.trialEndsAt).toEqual(trialEnd);
  });

  it("subscription.active ⇒ ACTIVE, grace/read-only cleared", () => {
    const current: CurrentBilling = { status: "PAST_DUE" };
    const d = computeBillingUpdate(subEvent("subscription.active"), current, NOW);
    expect(d.write?.status).toBe("ACTIVE");
    expect(d.write?.gracePeriodEndsAt).toBeNull();
    expect(d.write?.readOnlyAt).toBeNull();
    expect(d.write?.cancelAtPeriodEnd).toBe(false);
    expect(d.write?.canceledAt).toBeNull();
  });

  it("subscription.active while still trialing ⇒ TRIALING + trialEndsAt (D1)", () => {
    const trialEnd = new Date("2026-06-10T00:00:00.000Z");
    const d = computeBillingUpdate(
      subEvent("subscription.active", { status: "trialing", trialEnd }),
      { status: "NONE" },
      NOW,
    );
    expect(d.write?.status).toBe("TRIALING");
    expect(d.write?.trialEndsAt).toEqual(trialEnd);
    expect(d.write?.gracePeriodEndsAt).toBeNull();
    expect(d.write?.readOnlyAt).toBeNull();
  });

  it("subscription.updated ⇒ reconciles fields verbatim, leaves status enum alone", () => {
    const d = computeBillingUpdate(
      subEvent("subscription.updated", { cancelAtPeriodEnd: true, productId: "prod_2" }),
      { status: "ACTIVE" },
      NOW,
    );
    expect(d.write?.status).toBeUndefined();
    expect(d.write?.cancelAtPeriodEnd).toBe(true);
    expect(d.write?.polarProductId).toBe("prod_2");
  });

  it("subscription.canceled ⇒ CANCELED + cancelAtPeriodEnd", () => {
    const canceledAt = new Date("2026-05-20T00:00:00.000Z");
    const d = computeBillingUpdate(subEvent("subscription.canceled", { canceledAt }), null, NOW);
    expect(d.write?.status).toBe("CANCELED");
    expect(d.write?.cancelAtPeriodEnd).toBe(true);
    expect(d.write?.canceledAt).toEqual(canceledAt);
  });

  it("subscription.uncanceled ⇒ back to ACTIVE, cancel flags cleared", () => {
    const d = computeBillingUpdate(subEvent("subscription.uncanceled"), { status: "CANCELED" }, NOW);
    expect(d.write?.status).toBe("ACTIVE");
    expect(d.write?.cancelAtPeriodEnd).toBe(false);
    expect(d.write?.canceledAt).toBeNull();
  });

  it("subscription.revoked ⇒ PAST_DUE + 7-day grace (D2), never READ_ONLY here", () => {
    const d = computeBillingUpdate(subEvent("subscription.revoked"), { status: "ACTIVE" }, NOW);
    expect(d.write?.status).toBe("PAST_DUE");
    expect(d.write?.readOnlyAt).toBeUndefined();
    const expected = new Date(NOW.getTime() + GRACE_PERIOD_DAYS * 86_400_000);
    expect(d.write?.gracePeriodEndsAt).toEqual(expected);
  });
});

describe("computeBillingUpdate — orders", () => {
  it("order.paid ⇒ ACTIVE, grace cleared, customer/sub ids set", () => {
    const event: WebhookEvent = {
      type: "order.paid",
      data: {
        customerId: "cus_1",
        productId: "prod_1",
        subscriptionId: "sub_1",
        subscription: { id: "sub_1", status: "active", currentPeriodEnd: new Date("2026-07-01T00:00:00.000Z") },
        customer: { externalId: WS },
      },
    };
    const d = computeBillingUpdate(event, null, NOW);
    expect(d.workspaceId).toBe(WS);
    expect(d.write?.status).toBe("ACTIVE");
    expect(d.write?.polarCustomerId).toBe("cus_1");
    expect(d.write?.gracePeriodEndsAt).toBeNull();
  });

  it("order.refunded ⇒ record-only (defers to the subscription event)", () => {
    const event: WebhookEvent = { type: "order.refunded", data: { customer: { externalId: WS } } };
    expect(computeBillingUpdate(event, null, NOW).write).toBeNull();
  });
});

describe("computeBillingUpdate — informational + unknown", () => {
  it.each(["checkout.created", "checkout.updated"])("%s ⇒ record-only", (type) => {
    const event: WebhookEvent = { type, data: { metadata: { workspaceId: WS } } };
    const d = computeBillingUpdate(event, null, NOW);
    expect(d.workspaceId).toBe(WS);
    expect(d.write).toBeNull();
  });

  it("unknown event type ⇒ record-only, no crash", () => {
    const event: WebhookEvent = { type: "subscription.paused", data: { metadata: { workspaceId: WS } } };
    expect(computeBillingUpdate(event, null, NOW).write).toBeNull();
  });
});

describe("computeBillingUpdate — customer.state_changed (authoritative reconcile)", () => {
  function stateEvent(activeSubscriptions: Array<Record<string, unknown>>): WebhookEvent {
    return {
      type: "customer.state_changed",
      data: { id: "cus_1", externalId: WS, activeSubscriptions },
    };
  }

  it("active subscription in snapshot ⇒ ACTIVE, even from a prior READ_ONLY", () => {
    const d = computeBillingUpdate(
      stateEvent([
        {
          id: "sub_1",
          productId: "prod_1",
          status: "active",
          currentPeriodEnd: new Date("2026-07-01T00:00:00.000Z"),
          trialEnd: null,
          cancelAtPeriodEnd: false,
          canceledAt: null,
        },
      ]),
      { status: "READ_ONLY" },
      NOW,
    );
    expect(d.write?.status).toBe("ACTIVE");
    expect(d.write?.gracePeriodEndsAt).toBeNull();
    expect(d.write?.readOnlyAt).toBeNull();
    expect(d.write?.polarCustomerId).toBe("cus_1");
  });

  it("trialing subscription in snapshot ⇒ TRIALING", () => {
    const d = computeBillingUpdate(
      stateEvent([{ id: "sub_1", status: "trialing", trialEnd: new Date("2026-06-10T00:00:00.000Z") }]),
      null,
      NOW,
    );
    expect(d.write?.status).toBe("TRIALING");
  });

  it("no active subscription + prior entitlement ⇒ READ_ONLY (D3 safe stop)", () => {
    const d = computeBillingUpdate(stateEvent([]), { status: "ACTIVE" }, NOW);
    expect(d.write?.status).toBe("READ_ONLY");
    expect(d.write?.readOnlyAt).toEqual(NOW);
  });

  it("no active subscription + never entitled (NONE) ⇒ status untouched", () => {
    const d = computeBillingUpdate(stateEvent([]), { status: "NONE" }, NOW);
    expect(d.write?.status).toBeUndefined();
    expect(d.write?.polarCustomerId).toBe("cus_1");
  });
});
