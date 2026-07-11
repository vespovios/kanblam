import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

// The accept route transitively imports the workspace-scope helper, which pulls
// in next-auth; stub it so the route module loads under vitest. The route never
// calls auth() — it is keyed on the invite token, not a session.
vi.mock("@/auth", () => ({ auth: vi.fn() }));
// Mutable feature mirror so a test can flip billingEnabled without reloading
// modules (same pattern as billing-enforcement.test.ts). The accept route's
// enforcement seam reads this module at call time.
vi.mock("@/lib/config/features", () => ({ features: { billingEnabled: false } }));

import { POST } from "@/app/api/invite/accept/route";
import { generateToken, hashToken } from "@/lib/invites/token";
import { features } from "@/lib/config/features";

const prisma = new PrismaClient();

let workspaceId: string;
let adminId: string;

function setBilling(enabled: boolean) {
  (features as { billingEnabled: boolean }).billingEnabled = enabled;
}

beforeEach(async () => {
  await prisma.workspaceBilling.deleteMany();
  await prisma.invite.deleteMany();
  await prisma.user.deleteMany();
  await prisma.workspace.deleteMany();
  const ws = await prisma.workspace.create({ data: { name: "AcceptWS" } });
  const admin = await prisma.user.create({
    data: { workspaceId: ws.id, email: "admin@accept.test", role: "ADMIN" },
  });
  workspaceId = ws.id;
  adminId = admin.id;
  setBilling(false);
});

afterAll(async () => {
  await prisma.$disconnect();
});

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/invite/accept", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/invite/accept", () => {
  it("accepts a valid token, creates user, marks invite accepted", async () => {
    const rawToken = generateToken();
    await prisma.invite.create({
      data: {
        workspaceId,
        email: "new@accept.test",
        tokenHash: hashToken(rawToken),
        invitedById: adminId,
        expiresAt: new Date(Date.now() + 86400_000),
      },
    });

    const res = await POST(
      makeRequest({ token: rawToken, name: "New Person", password: "strongpw123" })
    );

    expect(res.status).toBe(201);
    const user = await prisma.user.findFirst({ where: { email: "new@accept.test" } });
    expect(user).not.toBeNull();
    expect(user!.name).toBe("New Person");
    expect(user!.passwordHash).not.toBeNull();

    const invite = await prisma.invite.findFirst({ where: { email: "new@accept.test" } });
    expect(invite?.acceptedAt).not.toBeNull();
  });

  it("rejects unknown token with 404", async () => {
    const res = await POST(
      makeRequest({ token: "0".repeat(64), name: "X", password: "strongpw123" })
    );
    expect(res.status).toBe(404);
  });

  it("rejects expired token with 410", async () => {
    const rawToken = generateToken();
    await prisma.invite.create({
      data: {
        workspaceId,
        email: "expired@accept.test",
        tokenHash: hashToken(rawToken),
        invitedById: adminId,
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    const res = await POST(
      makeRequest({ token: rawToken, name: "X", password: "strongpw123" })
    );
    expect(res.status).toBe(410);
  });

  it("billing on + READ_ONLY workspace ⇒ returns 402 and creates no user", async () => {
    setBilling(true);
    await prisma.workspaceBilling.create({
      data: { workspaceId, status: "READ_ONLY" },
    });
    const rawToken = generateToken();
    await prisma.invite.create({
      data: {
        workspaceId,
        email: "readonly@accept.test",
        tokenHash: hashToken(rawToken),
        invitedById: adminId,
        expiresAt: new Date(Date.now() + 86400_000),
      },
    });

    const res = await POST(
      makeRequest({ token: rawToken, name: "X", password: "strongpw123" })
    );
    expect(res.status).toBe(402);

    // The mutation never landed: no user created, invite still unaccepted.
    const user = await prisma.user.findFirst({ where: { email: "readonly@accept.test" } });
    expect(user).toBeNull();
    const invite = await prisma.invite.findFirst({ where: { email: "readonly@accept.test" } });
    expect(invite?.acceptedAt).toBeNull();
  });

  it("rejects already-accepted token with 410", async () => {
    const rawToken = generateToken();
    await prisma.invite.create({
      data: {
        workspaceId,
        email: "used@accept.test",
        tokenHash: hashToken(rawToken),
        invitedById: adminId,
        expiresAt: new Date(Date.now() + 86400_000),
        acceptedAt: new Date(),
      },
    });
    const res = await POST(
      makeRequest({ token: rawToken, name: "X", password: "strongpw123" })
    );
    expect(res.status).toBe(410);
  });
});
