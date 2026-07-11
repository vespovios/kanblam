import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { BillingStatus } from "@prisma/client";

// Stub the two client child components to identifiable markers so this test
// asserts the view's copy + which action it routes to (checkout vs portal) and
// with what label — without pulling in their fetch/onClick runtime.
vi.mock("@/components/billing/subscribe-form", () => ({
  SubscribeForm: ({ label = "Subscribe" }: { label?: string }) =>
    createElement("button", { "data-action": "subscribe" }, label),
}));
vi.mock("@/components/billing/portal-button", () => ({
  PortalButton: ({ label }: { label: string }) =>
    createElement("button", { "data-action": "portal" }, label),
}));

import { BillingSettingsView } from "@/components/billing/billing-settings-view";

interface Opts {
  trialEndsAt?: string | null;
  currentPeriodEnd?: string | null;
  gracePeriodEndsAt?: string | null;
  now?: string;
}

const render = (status: BillingStatus | null, opts: Opts = {}) =>
  renderToStaticMarkup(
    createElement(BillingSettingsView, {
      status,
      trialEndsAt: opts.trialEndsAt ?? null,
      currentPeriodEnd: opts.currentPeriodEnd ?? null,
      gracePeriodEndsAt: opts.gracePeriodEndsAt ?? null,
      now: opts.now,
    }),
  );

describe("BillingSettingsView — main copy + action across BillingStatus states", () => {
  // The card heading is always present.
  it("always renders the Billing heading", () => {
    expect(render("ACTIVE")).toContain("Billing");
  });

  it.each<BillingStatus | null>([null, "NONE"])(
    "%s ⇒ not-subscribed copy + Subscribe (checkout)",
    (status) => {
      const html = render(status);
      expect(html).toContain("subscribed yet");
      expect(html).toContain('data-action="subscribe"');
      expect(html).toContain("Subscribe");
      expect(html).not.toContain('data-action="portal"');
    },
  );

  it("TRIALING ⇒ trial-active copy + countdown + Manage (portal)", () => {
    const html = render("TRIALING", {
      trialEndsAt: "2026-06-10T00:00:00.000Z",
      now: "2026-05-31T00:00:00.000Z",
    });
    expect(html).toContain("trial is active");
    expect(html).toContain("10 days left");
    expect(html).toContain('data-action="portal"');
    expect(html).toContain("Manage subscription");
  });

  it("TRIALING ⇒ singular day phrasing when one day remains", () => {
    const html = render("TRIALING", {
      trialEndsAt: "2026-06-01T00:00:00.000Z",
      now: "2026-05-31T00:00:00.000Z",
    });
    expect(html).toContain("1 day left");
    expect(html).not.toContain("1 days left");
  });

  it("ACTIVE ⇒ subscribed copy + renewal date + Manage (portal)", () => {
    const html = render("ACTIVE", { currentPeriodEnd: "2026-06-30T00:00:00.000Z" });
    expect(html).toContain("subscribed");
    expect(html).toContain("renews on");
    expect(html).toContain('data-action="portal"');
    expect(html).toContain("Manage subscription");
    expect(html).not.toContain('data-action="subscribe"');
  });

  it("PAST_DUE ⇒ payment-failed copy + Update payment method (portal)", () => {
    const html = render("PAST_DUE", { gracePeriodEndsAt: "2026-06-07T00:00:00.000Z" });
    expect(html).toContain("payment failed");
    expect(html).toContain('data-action="portal"');
    expect(html).toContain("Update payment method");
  });

  it("CANCELED ⇒ canceled copy + Resume subscription (portal)", () => {
    const html = render("CANCELED", { currentPeriodEnd: "2026-06-30T00:00:00.000Z" });
    expect(html).toContain("canceled");
    expect(html).toContain('data-action="portal"');
    expect(html).toContain("Resume subscription");
  });

  it.each<BillingStatus>(["READ_ONLY", "SUSPENDED"])(
    "%s ⇒ read-only copy + Reactivate (checkout)",
    (status) => {
      const html = render(status);
      expect(html).toContain("read-only");
      expect(html).toContain('data-action="subscribe"');
      expect(html).toContain("Reactivate subscription");
      expect(html).not.toContain('data-action="portal"');
    },
  );
});
