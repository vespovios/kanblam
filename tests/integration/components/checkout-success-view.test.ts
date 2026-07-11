import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { BillingStatus } from "@prisma/client";

// Render the view in isolation: stub next/link to a plain anchor so the pure
// presentational output can be asserted without an App Router/runtime context.
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: unknown }) =>
    createElement("a", { href }, children as never),
}));

import { CheckoutSuccessView } from "@/components/billing/checkout-success-view";

const render = (status: BillingStatus | null) =>
  renderToStaticMarkup(createElement(CheckoutSuccessView, { status }));

describe("CheckoutSuccessView — across BillingStatus states", () => {
  // Active subscription: webhook has flipped entitlement; confirm and return.
  const activeStates: BillingStatus[] = ["ACTIVE", "TRIALING"];
  // Everything else (incl. the lazy-created NONE row and no row at all) is the
  // "payment received, still finalising" pending copy.
  const pendingStates: (BillingStatus | null)[] = [
    null,
    "NONE",
    "PAST_DUE",
    "READ_ONLY",
    "SUSPENDED",
    "CANCELED",
  ];

  it.each(activeStates)("renders the active confirmation for %s", (status) => {
    const html = render(status);
    expect(html).toContain("You&#x27;re all set");
    expect(html).toContain("subscription is active");
    expect(html).not.toContain("Payment received");
    expect(html).toContain('href="/dashboard"');
  });

  it.each(pendingStates)("renders the pending confirmation for %s", (status) => {
    const html = render(status);
    expect(html).toContain("Payment received");
    expect(html).toContain("finalising your subscription");
    expect(html).not.toContain("You&#x27;re all set");
    expect(html).toContain('href="/dashboard"');
  });
});
