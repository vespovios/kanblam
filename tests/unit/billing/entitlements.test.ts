import { describe, it, expect, beforeEach, vi } from "vitest";
import type { BillingStatus } from "@prisma/client";

// `features.billingEnabled` is read at call time, so a mutable mock lets each
// test flip the flag. Default mirrors the committed default: billing OFF.
vi.mock("@/lib/config/features", () => ({
  features: { billingEnabled: false },
}));

import { features } from "@/lib/config/features";
import { workspaceAccessLevel } from "@/lib/billing/entitlements";

const ALL_STATUSES: BillingStatus[] = [
  "NONE",
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "READ_ONLY",
  "SUSPENDED",
  "CANCELED",
];

const PAST = new Date("2026-01-01T00:00:00Z");
const FUTURE = new Date("2027-01-01T00:00:00Z");
const NOW = new Date("2026-06-01T00:00:00Z");

function setBilling(enabled: boolean) {
  (features as { billingEnabled: boolean }).billingEnabled = enabled;
}

beforeEach(() => {
  setBilling(false);
});

describe("workspaceAccessLevel — self-host invariant (BILLING_ENABLED=false)", () => {
  it("returns 'full' for a null billing row", () => {
    expect(workspaceAccessLevel(null, NOW)).toBe("full");
  });

  // The single most important guarantee: with billing off, *every* status and
  // every period-end position is fully writable. AGPL features are never gated.
  it.each(ALL_STATUSES)("returns 'full' for status %s regardless of period end", (status) => {
    expect(workspaceAccessLevel({ status, currentPeriodEnd: null }, NOW)).toBe("full");
    expect(workspaceAccessLevel({ status, currentPeriodEnd: PAST }, NOW)).toBe("full");
    expect(workspaceAccessLevel({ status, currentPeriodEnd: FUTURE }, NOW)).toBe("full");
  });
});

describe("workspaceAccessLevel — billing enabled (truth table)", () => {
  beforeEach(() => {
    setBilling(true);
  });

  it("returns 'full' when there is no billing row", () => {
    expect(workspaceAccessLevel(null, NOW)).toBe("full");
  });

  it.each<[BillingStatus]>([["NONE"], ["TRIALING"], ["ACTIVE"], ["PAST_DUE"]])(
    "status %s is writable ('full')",
    (status) => {
      expect(workspaceAccessLevel({ status, currentPeriodEnd: null }, NOW)).toBe("full");
    },
  );

  it("READ_ONLY ⇒ 'read-only'", () => {
    expect(workspaceAccessLevel({ status: "READ_ONLY", currentPeriodEnd: null }, NOW)).toBe(
      "read-only",
    );
  });

  it("SUSPENDED ⇒ 'suspended'", () => {
    expect(workspaceAccessLevel({ status: "SUSPENDED", currentPeriodEnd: null }, NOW)).toBe(
      "suspended",
    );
  });

  describe("CANCELED depends on currentPeriodEnd", () => {
    it("future period end ⇒ still 'full' until it passes", () => {
      expect(workspaceAccessLevel({ status: "CANCELED", currentPeriodEnd: FUTURE }, NOW)).toBe(
        "full",
      );
    });

    it("past period end ⇒ lapses to 'read-only'", () => {
      expect(workspaceAccessLevel({ status: "CANCELED", currentPeriodEnd: PAST }, NOW)).toBe(
        "read-only",
      );
    });

    it("null period end ⇒ 'read-only' (nothing keeping it active)", () => {
      expect(workspaceAccessLevel({ status: "CANCELED", currentPeriodEnd: null }, NOW)).toBe(
        "read-only",
      );
    });
  });
});
