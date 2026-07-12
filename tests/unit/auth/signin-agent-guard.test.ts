import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { user: { findFirst: vi.fn() } },
}));

import { authConfig } from "@/lib/auth/config";
import { prisma } from "@/lib/db";

/** The magic-link (Nodemailer) sign-in path must reject agent members.
 *  Agents are API-only: synthetic undeliverable email + null passwordHash
 *  already block them structurally, and this callback is the third layer. */

const signIn = authConfig.callbacks!.signIn!;

function call(email: string | null, provider: string) {
  return signIn({
    user: { id: "u1", email } as never,
    account: { provider, type: "email", providerAccountId: email ?? "" } as never,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("signIn callback — magic-link agent guard", () => {
  it("rejects an AGENT user on the nodemailer provider", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ kind: "AGENT" } as never);
    await expect(call("agent-abc@agents.internal", "nodemailer")).resolves.toBe(false);
  });

  it("allows a HUMAN user on the nodemailer provider", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ kind: "HUMAN" } as never);
    await expect(call("peter@example.com", "nodemailer")).resolves.toBe(true);
  });

  it("allows an unknown email (no user row) — magic-link signup unaffected", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null as never);
    await expect(call("new@example.com", "nodemailer")).resolves.toBe(true);
  });

  it("looks the user up by lowercased email", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null as never);
    await call("MiXeD@Example.COM", "nodemailer");
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { email: "mixed@example.com" },
      select: { kind: true },
    });
  });

  it("rejects a nodemailer sign-in with no email at all", async () => {
    await expect(call(null, "nodemailer")).resolves.toBe(false);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it("passes other providers through without a DB read", async () => {
    await expect(call("peter@example.com", "credentials")).resolves.toBe(true);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });
});
