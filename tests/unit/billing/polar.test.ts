import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/lib/config/features", () => ({ features: { billingEnabled: false } }));

import { getPolarClient, polarServer, __resetPolarClientForTests } from "@/lib/billing/polar";
import { features } from "@/lib/config/features";

function setBilling(enabled: boolean) {
  (features as { billingEnabled: boolean }).billingEnabled = enabled;
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  __resetPolarClientForTests();
  setBilling(false);
  delete process.env.POLAR_ACCESS_TOKEN;
  delete process.env.POLAR_ENV;
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

describe("getPolarClient", () => {
  it("self-host invariant: billing off ⇒ null, token never read", () => {
    process.env.POLAR_ACCESS_TOKEN = "token-should-be-ignored";
    expect(getPolarClient()).toBeNull();
  });

  it("billing on but token absent ⇒ null, warns once", () => {
    setBilling(true);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(getPolarClient()).toBeNull();
    expect(getPolarClient()).toBeNull(); // memoised: no second construction attempt
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("billing on with token ⇒ constructs a client (memoised)", () => {
    setBilling(true);
    process.env.POLAR_ACCESS_TOKEN = "test-access-token";

    const client = getPolarClient();
    expect(client).not.toBeNull();
    expect(getPolarClient()).toBe(client);
  });
});

describe("polarServer", () => {
  it("defaults to production when POLAR_ENV is unset (test/live-by-token)", () => {
    expect(polarServer()).toBe("production");
  });

  it("stays production for any value other than the literal 'sandbox'", () => {
    process.env.POLAR_ENV = "prod";
    expect(polarServer()).toBe("production");
    process.env.POLAR_ENV = "";
    expect(polarServer()).toBe("production");
    process.env.POLAR_ENV = "production";
    expect(polarServer()).toBe("production");
  });

  it("is sandbox only when explicitly POLAR_ENV=sandbox", () => {
    process.env.POLAR_ENV = "sandbox";
    expect(polarServer()).toBe("sandbox");
  });
});
