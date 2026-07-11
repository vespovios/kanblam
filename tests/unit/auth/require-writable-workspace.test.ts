import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/config/features", () => ({ features: { billingEnabled: false } }));
vi.mock("@/lib/db", () => ({
  prisma: { workspaceBilling: { findUnique: vi.fn() } },
}));

import { requireWritableWorkspace } from "@/lib/auth/workspace-scope";
import { auth } from "@/auth";
import { features } from "@/lib/config/features";
import { prisma } from "@/lib/db";

const AUTHED = {
  user: { id: "u1", email: "a@b.com", workspaceId: "ws1", role: "ADMIN" },
  expires: new Date().toISOString(),
};

function setBilling(enabled: boolean) {
  (features as { billingEnabled: boolean }).billingEnabled = enabled;
}

beforeEach(() => {
  vi.clearAllMocks();
  setBilling(false);
});

describe("requireWritableWorkspace", () => {
  it("self-host invariant: billing off ⇒ pass-through with no DB read", async () => {
    vi.mocked(auth).mockResolvedValue(AUTHED as never);

    const ctx = await requireWritableWorkspace();

    expect(ctx).toEqual({ userId: "u1", workspaceId: "ws1", role: "ADMIN" });
    expect(prisma.workspaceBilling.findUnique).not.toHaveBeenCalled();
  });

  it("propagates the 401 from requireWorkspaceContext when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    await expect(requireWritableWorkspace()).rejects.toMatchObject({
      name: "WorkspaceAuthError",
      status: 401,
    });
  });

  it("billing on, no billing row ⇒ returns context", async () => {
    setBilling(true);
    vi.mocked(auth).mockResolvedValue(AUTHED as never);
    vi.mocked(prisma.workspaceBilling.findUnique).mockResolvedValue(null as never);

    const ctx = await requireWritableWorkspace();
    expect(ctx.workspaceId).toBe("ws1");
  });

  it("billing on, ACTIVE ⇒ returns context", async () => {
    setBilling(true);
    vi.mocked(auth).mockResolvedValue(AUTHED as never);
    vi.mocked(prisma.workspaceBilling.findUnique).mockResolvedValue({
      status: "ACTIVE",
      currentPeriodEnd: null,
    } as never);

    const ctx = await requireWritableWorkspace();
    expect(ctx.workspaceId).toBe("ws1");
  });

  it("billing on, READ_ONLY ⇒ throws 402", async () => {
    setBilling(true);
    vi.mocked(auth).mockResolvedValue(AUTHED as never);
    vi.mocked(prisma.workspaceBilling.findUnique).mockResolvedValue({
      status: "READ_ONLY",
      currentPeriodEnd: null,
    } as never);

    await expect(requireWritableWorkspace()).rejects.toMatchObject({
      name: "WorkspaceAuthError",
      status: 402,
    });
  });

  it("billing on, SUSPENDED ⇒ throws 402", async () => {
    setBilling(true);
    vi.mocked(auth).mockResolvedValue(AUTHED as never);
    vi.mocked(prisma.workspaceBilling.findUnique).mockResolvedValue({
      status: "SUSPENDED",
      currentPeriodEnd: null,
    } as never);

    await expect(requireWritableWorkspace()).rejects.toMatchObject({ status: 402 });
  });
});
