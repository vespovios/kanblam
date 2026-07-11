import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/lib/config/features", () => ({ features: { billingEnabled: false } }));

import { loadProductMap, productIdFor } from "@/lib/billing/products";
import { features } from "@/lib/config/features";

function setBilling(enabled: boolean) {
  (features as { billingEnabled: boolean }).billingEnabled = enabled;
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  setBilling(false);
  delete process.env.POLAR_PRODUCT_HOSTED_STANDARD_MONTHLY;
  delete process.env.POLAR_PRODUCT_HOSTED_STANDARD_ANNUAL;
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

describe("loadProductMap", () => {
  it("silent no-op when billing off ⇒ null, even with ids present", () => {
    process.env.POLAR_PRODUCT_HOSTED_STANDARD_MONTHLY = "prod_m";
    process.env.POLAR_PRODUCT_HOSTED_STANDARD_ANNUAL = "prod_a";
    expect(loadProductMap()).toBeNull();
  });

  it("parses a complete env map when billing on", () => {
    setBilling(true);
    process.env.POLAR_PRODUCT_HOSTED_STANDARD_MONTHLY = "prod_monthly_123";
    process.env.POLAR_PRODUCT_HOSTED_STANDARD_ANNUAL = "prod_annual_456";

    expect(loadProductMap()).toEqual({
      hosted_standard: { monthly: "prod_monthly_123", annual: "prod_annual_456" },
    });
  });

  it("throws loudly on a partial map when billing on, naming the missing var", () => {
    setBilling(true);
    process.env.POLAR_PRODUCT_HOSTED_STANDARD_MONTHLY = "prod_monthly_123";
    // annual intentionally missing

    expect(() => loadProductMap()).toThrowError(/POLAR_PRODUCT_HOSTED_STANDARD_ANNUAL/);
  });

  it("treats whitespace-only ids as missing", () => {
    setBilling(true);
    process.env.POLAR_PRODUCT_HOSTED_STANDARD_MONTHLY = "   ";
    process.env.POLAR_PRODUCT_HOSTED_STANDARD_ANNUAL = "prod_a";

    expect(() => loadProductMap()).toThrowError(/POLAR_PRODUCT_HOSTED_STANDARD_MONTHLY/);
  });
});

describe("productIdFor", () => {
  it("returns null when billing off", () => {
    expect(productIdFor({ tier: "hosted_standard", cadence: "monthly" })).toBeNull();
  });

  it("resolves a single plan's product id when configured", () => {
    setBilling(true);
    process.env.POLAR_PRODUCT_HOSTED_STANDARD_MONTHLY = "prod_monthly_123";
    process.env.POLAR_PRODUCT_HOSTED_STANDARD_ANNUAL = "prod_annual_456";

    expect(productIdFor({ tier: "hosted_standard", cadence: "annual" })).toBe("prod_annual_456");
  });
});
