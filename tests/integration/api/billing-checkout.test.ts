import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { setupTestWorkspace, type SeededWorkspace } from "@/tests/integration/helpers/workspace";

// Toggle billing per test by mutating the mocked flag (mirrors polar.test.ts).
vi.mock("@/lib/config/features", () => ({ features: { billingEnabled: false } }));
// Mock the Polar seam so no network or real client is constructed.
vi.mock("@/lib/billing/polar", () => ({ getPolarClient: vi.fn() }));
vi.mock("@/lib/billing/products", () => ({ productIdFor: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { features } from "@/lib/config/features";
import { getPolarClient } from "@/lib/billing/polar";
import { productIdFor } from "@/lib/billing/products";
import { auth } from "@/auth";

const prisma = new PrismaClient();
let seed: SeededWorkspace;
let createCheckout: ReturnType<typeof vi.fn>;

function setBilling(enabled: boolean) {
  (features as { billingEnabled: boolean }).billingEnabled = enabled;
}

function mockAdmin() {
  vi.mocked(auth).mockResolvedValue({
    user: {
      id: seed.adminId,
      email: "admin@test.local",
      name: "Admin",
      workspaceId: seed.workspaceId,
      role: "ADMIN",
    },
    expires: new Date(Date.now() + 86400_000).toISOString(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

function mockMember() {
  vi.mocked(auth).mockResolvedValue({
    user: {
      id: seed.memberId,
      email: "member@test.local",
      name: "Member",
      workspaceId: seed.workspaceId,
      role: "MEMBER",
    },
    expires: new Date(Date.now() + 86400_000).toISOString(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

function post(body: unknown) {
  return new Request("http://localhost/api/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = { tier: "hosted_standard", cadence: "monthly" } as const;

beforeEach(async () => {
  seed = await setupTestWorkspace(prisma);

  setBilling(false);
  createCheckout = vi.fn().mockResolvedValue({ url: "https://sandbox.polar.sh/checkout/abc123" });
  vi.mocked(getPolarClient).mockReturnValue({
    checkouts: { create: createCheckout },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  vi.mocked(productIdFor).mockReturnValue("prod_hosted_standard_monthly");
  mockAdmin();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/billing/checkout — flag gating", () => {
  it("returns 404 when billing is disabled (self-host invariant)", async () => {
    setBilling(false);
    const { POST } = await import("@/app/api/billing/checkout/route");
    const res = await POST(post(VALID_BODY));
    expect(res.status).toBe(404);
    expect(createCheckout).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    setBilling(true);
    // `auth` is overloaded (its resolved type collapses to NextMiddleware here),
    // so cast the unauthenticated `null` result to satisfy the mock signature.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(auth).mockResolvedValue(null as any);
    const { POST } = await import("@/app/api/billing/checkout/route");
    const res = await POST(post(VALID_BODY));
    expect(res.status).toBe(401);
    expect(createCheckout).not.toHaveBeenCalled();
  });

  it("returns 403 for a non-admin member", async () => {
    setBilling(true);
    mockMember();
    const { POST } = await import("@/app/api/billing/checkout/route");
    const res = await POST(post(VALID_BODY));
    expect(res.status).toBe(403);
    expect(createCheckout).not.toHaveBeenCalled();
  });
});

describe("POST /api/billing/checkout — happy path", () => {
  it("builds a well-formed single-use Polar checkout session and returns its url", async () => {
    setBilling(true);
    const { POST } = await import("@/app/api/billing/checkout/route");
    const res = await POST(post(VALID_BODY));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ url: "https://sandbox.polar.sh/checkout/abc123" });

    expect(createCheckout).toHaveBeenCalledTimes(1);
    const arg = createCheckout.mock.calls[0][0];
    expect(arg.products).toEqual(["prod_hosted_standard_monthly"]);
    expect(arg.externalCustomerId).toBe(seed.workspaceId);
    expect(arg.customerEmail).toBe("admin@test.local");
    expect(arg.customerName).toBe("Admin");
    expect(arg.metadata).toEqual({
      workspaceId: seed.workspaceId,
      tier: "hosted_standard",
      initiatedBy: seed.adminId,
    });
    expect(arg.successUrl).toMatch(/\/billing\/success$/);
    expect(arg.returnUrl).toMatch(/\/billing\/cancel$/);
  });

  it("503s when APP_URL is unset (no silent localhost fallback)", async () => {
    setBilling(true);
    const prev = process.env.APP_URL;
    delete process.env.APP_URL;
    try {
      const { POST } = await import("@/app/api/billing/checkout/route");
      const res = await POST(post(VALID_BODY));
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: "App URL not configured" });
      expect(createCheckout).not.toHaveBeenCalled();
    } finally {
      process.env.APP_URL = prev;
    }
  });

  it("builds success/cancel URLs from APP_URL", async () => {
    setBilling(true);
    const prev = process.env.APP_URL;
    process.env.APP_URL = "https://kanblam.example";
    try {
      const { POST } = await import("@/app/api/billing/checkout/route");
      const res = await POST(post(VALID_BODY));
      expect(res.status).toBe(200);
      const arg = createCheckout.mock.calls[0][0];
      expect(arg.successUrl).toBe("https://kanblam.example/billing/success");
      expect(arg.returnUrl).toBe("https://kanblam.example/billing/cancel");
    } finally {
      process.env.APP_URL = prev;
    }
  });

  it("returns 400 on an invalid tier/cadence", async () => {
    setBilling(true);
    const { POST } = await import("@/app/api/billing/checkout/route");
    const res = await POST(post({ tier: "enterprise", cadence: "weekly" }));
    expect(res.status).toBe(400);
    expect(createCheckout).not.toHaveBeenCalled();
  });
});

describe("POST /api/billing/checkout — lazy WorkspaceBilling creation", () => {
  it("creates exactly one billing row even when checkout is initiated twice", async () => {
    setBilling(true);
    const { POST } = await import("@/app/api/billing/checkout/route");

    await POST(post(VALID_BODY));
    await POST(post(VALID_BODY));

    const rows = await prisma.workspaceBilling.findMany({
      where: { workspaceId: seed.workspaceId },
    });
    expect(rows).toHaveLength(1);
    // Lazy create leaves entitlement untouched and maps the Polar customer 1:1.
    expect(rows[0].status).toBe("NONE");
    expect(rows[0].externalCustomerId).toBe(seed.workspaceId);
  });

  it("never overwrites an existing billing row", async () => {
    setBilling(true);
    // Pre-existing row already advanced past NONE by a (hypothetical) webhook.
    await prisma.workspaceBilling.create({
      data: {
        workspaceId: seed.workspaceId,
        externalCustomerId: seed.workspaceId,
        status: "ACTIVE",
      },
    });

    const { POST } = await import("@/app/api/billing/checkout/route");
    const res = await POST(post(VALID_BODY));
    expect(res.status).toBe(200);

    const row = await prisma.workspaceBilling.findUniqueOrThrow({
      where: { workspaceId: seed.workspaceId },
    });
    expect(row.status).toBe("ACTIVE");
  });
});
