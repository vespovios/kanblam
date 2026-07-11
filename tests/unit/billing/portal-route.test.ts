import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
// Mutable feature mirror (same pattern as the other billing unit tests).
vi.mock("@/lib/config/features", () => ({ features: { billingEnabled: false } }));
vi.mock("@/lib/billing/polar", () => ({ getPolarClient: vi.fn() }));

import { POST } from "@/app/api/billing/portal/route";
import { auth } from "@/auth";
import { features } from "@/lib/config/features";
import { getPolarClient } from "@/lib/billing/polar";

function setBilling(enabled: boolean) {
  (features as { billingEnabled: boolean }).billingEnabled = enabled;
}

function authAs(role: "ADMIN" | "MEMBER" | null) {
  vi.mocked(auth).mockResolvedValue(
    role === null
      ? (null as never)
      : ({
          user: { id: "u1", email: "a@b.com", workspaceId: "ws1", role },
          expires: new Date(Date.now() + 86400_000).toISOString(),
        } as never),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  setBilling(false);
});

describe("POST /api/billing/portal", () => {
  it("returns 404 when billing is disabled (self-host invariant), before auth or Polar", async () => {
    authAs("ADMIN");
    const res = await POST();
    expect(res.status).toBe(404);
    expect(auth).not.toHaveBeenCalled();
    expect(getPolarClient).not.toHaveBeenCalled();
  });

  it("billing on, unauthenticated ⇒ 401", async () => {
    setBilling(true);
    authAs(null);
    const res = await POST();
    expect(res.status).toBe(401);
    expect(getPolarClient).not.toHaveBeenCalled();
  });

  it("billing on, non-admin ⇒ 403 (ADMIN-gated)", async () => {
    setBilling(true);
    authAs("MEMBER");
    const res = await POST();
    expect(res.status).toBe(403);
    expect(getPolarClient).not.toHaveBeenCalled();
  });

  it("billing on but unconfigured (no Polar client) ⇒ 503", async () => {
    setBilling(true);
    authAs("ADMIN");
    vi.mocked(getPolarClient).mockReturnValue(null);
    const res = await POST();
    expect(res.status).toBe(503);
  });

  it("billing on, configured, but APP_URL unset ⇒ 503 'App URL not configured'", async () => {
    setBilling(true);
    authAs("ADMIN");
    vi.mocked(getPolarClient).mockReturnValue({
      customerSessions: { create: vi.fn() },
    } as never);
    const prev = process.env.APP_URL;
    delete process.env.APP_URL;
    try {
      const res = await POST();
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: "App URL not configured" });
    } finally {
      process.env.APP_URL = prev;
    }
  });

  it("uses APP_URL for the portal return target", async () => {
    setBilling(true);
    authAs("ADMIN");
    const create = vi.fn().mockResolvedValue({ customerPortalUrl: "https://polar.test/portal/abc" });
    vi.mocked(getPolarClient).mockReturnValue({
      customerSessions: { create },
    } as never);
    const prev = process.env.APP_URL;
    process.env.APP_URL = "https://kanblam.example";
    try {
      const res = await POST();
      expect(res.status).toBe(200);
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ returnUrl: "https://kanblam.example/settings/billing" }),
      );
    } finally {
      process.env.APP_URL = prev;
    }
  });

  it("billing on, admin, configured ⇒ 200 with the portal url, keyed by workspaceId", async () => {
    setBilling(true);
    authAs("ADMIN");
    const create = vi.fn().mockResolvedValue({ customerPortalUrl: "https://polar.test/portal/abc" });
    vi.mocked(getPolarClient).mockReturnValue({
      customerSessions: { create },
    } as never);

    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://polar.test/portal/abc" });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ externalCustomerId: "ws1" }),
    );
  });
});
