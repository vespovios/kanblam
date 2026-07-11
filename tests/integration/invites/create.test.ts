import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createInvite } from "@/lib/invites/create";
import { hashToken } from "@/lib/invites/token";

const prisma = new PrismaClient();

let workspaceId: string;
let adminId: string;

beforeAll(async () => {
  await prisma.invite.deleteMany();
  await prisma.user.deleteMany();
  await prisma.workspace.deleteMany();

  const ws = await prisma.workspace.create({ data: { name: "Test WS" } });
  const admin = await prisma.user.create({
    data: { workspaceId: ws.id, email: "admin@test.com", role: "ADMIN" },
  });
  workspaceId = ws.id;
  adminId = admin.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("createInvite", () => {
  it("creates an invite row with a hashed token and returns the raw token", async () => {
    const { rawToken, invite } = await createInvite({
      workspaceId,
      invitedById: adminId,
      email: "new@test.com",
      appUrl: "https://tasker.test",
    });

    expect(rawToken).toMatch(/^[0-9a-f]{64}$/);
    expect(invite.email).toBe("new@test.com");
    expect(invite.tokenHash).toBe(hashToken(rawToken));
    expect(invite.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("rejects when the email already has a user in that workspace", async () => {
    await expect(
      createInvite({
        workspaceId,
        invitedById: adminId,
        email: "admin@test.com",
        appUrl: "https://tasker.test",
      })
    ).rejects.toThrow(/already/i);
  });

  it("rejects the reserved agents.internal domain", async () => {
    await expect(
      createInvite({
        workspaceId,
        invitedById: adminId,
        email: "bot@agents.internal",
        appUrl: "https://tasker.test",
      })
    ).rejects.toThrow(/reserved/i);
  });
});
