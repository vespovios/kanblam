import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { setupTestWorkspace, type SeededWorkspace } from "@/tests/integration/helpers/workspace";

// Mutable feature mirror so each test can flip billingEnabled without reloading
// modules (same pattern as billing-enforcement.test.ts). The cron route reads
// `features.billingEnabled` at call time; with no POLAR_ACCESS_TOKEN set,
// getPolarClient() stays null so the drift pass is skipped.
vi.mock("@/lib/config/features", () => ({ features: { billingEnabled: false } }));

import { features } from "@/lib/config/features";

const prisma = new PrismaClient();
let seed: SeededWorkspace;

function setBilling(enabled: boolean) {
  (features as { billingEnabled: boolean }).billingEnabled = enabled;
}

beforeEach(async () => {
  process.env.CRON_SECRET = "test-secret";
  // billing_events has no FK; clear it so a stray pending event can't perturb
  // pass 1 of the reconcile under test.
  await prisma.billingEvent.deleteMany();
  seed = await setupTestWorkspace(prisma);
  await prisma.billingEvent.deleteMany();
  setBilling(true);
});

afterAll(async () => {
  await prisma.$disconnect();
});

function postRequest(token?: string) {
  return new Request("http://localhost/api/cron/reconcile-billing", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

describe("POST /api/cron/reconcile-billing", () => {
  it("with valid bearer, flips a lapsed PAST_DUE workspace (grace elapsed) to READ_ONLY (200)", async () => {
    // No polarCustomerId ⇒ the drift pass skips this row, so the assertion turns
    // purely on the clock-driven PAST_DUE→READ_ONLY transition.
    await prisma.workspaceBilling.create({
      data: {
        workspaceId: seed.workspaceId,
        status: "PAST_DUE",
        gracePeriodEndsAt: new Date("2020-01-01T00:00:00.000Z"), // long past
      },
    });

    const { POST } = await import("@/app/api/cron/reconcile-billing/route");
    const res = await POST(postRequest("test-secret"));
    expect(res.status).toBe(200);

    const row = await prisma.workspaceBilling.findUniqueOrThrow({
      where: { workspaceId: seed.workspaceId },
    });
    expect(row.status).toBe("READ_ONLY");
    expect(row.readOnlyAt).not.toBeNull();
    // The time transition is a successful reconcile, so the full pass stamps
    // lastSyncedAt — the source for the health log's last-reconcile age.
    expect(row.lastSyncedAt).not.toBeNull();
  });

  it("rejects a wrong bearer token (401)", async () => {
    const { POST } = await import("@/app/api/cron/reconcile-billing/route");
    const res = await POST(postRequest("wrong"));
    expect(res.status).toBe(401);
  });

  it("self-host invariant: BILLING_ENABLED=false ⇒ the route does not exist (404)", async () => {
    setBilling(false);
    const { POST } = await import("@/app/api/cron/reconcile-billing/route");
    const res = await POST(postRequest("test-secret"));
    expect(res.status).toBe(404);
  });
});
