import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { setupTestWorkspace, type SeededWorkspace } from "@/tests/integration/helpers/workspace";
import {
  createApiToken,
  listApiTokens,
  revokeApiToken,
  verifyApiToken,
} from "@/lib/api-tokens/service";
import { API_TOKENS_PER_USER_MAX } from "@/lib/validators/api-token";

const prisma = new PrismaClient();
let seed: SeededWorkspace;

beforeEach(async () => {
  seed = await setupTestWorkspace(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("createApiToken", () => {
  it("returns a kb_-prefixed raw token exactly once and stores only a hash", async () => {
    const { token, record } = await createApiToken(seed.adminId, {
      name: "ci script",
      scopes: ["read", "write"],
    });
    expect(token).toMatch(/^kb_[A-Za-z0-9_-]{43}$/);
    expect(record.tokenPrefix).toBe(token.slice(0, 11));
    // the raw token appears nowhere in the DB row
    const row = await prisma.apiToken.findUniqueOrThrow({ where: { id: record.id } });
    expect(row.tokenHash).not.toContain(token);
    expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("enforces the per-user active-token cap", async () => {
    for (let i = 0; i < API_TOKENS_PER_USER_MAX; i++) {
      await createApiToken(seed.adminId, { name: `t${i}`, scopes: ["read"] });
    }
    await expect(
      createApiToken(seed.adminId, { name: "one too many", scopes: ["read"] }),
    ).rejects.toThrow(/limit/i);
    // revoking one frees a slot
    const tokens = await listApiTokens(seed.adminId);
    await revokeApiToken(seed.adminId, tokens[0].id);
    await expect(
      createApiToken(seed.adminId, { name: "fits again", scopes: ["read"] }),
    ).resolves.toBeTruthy();
  });
});

describe("verifyApiToken", () => {
  it("resolves a valid token to its user and scopes", async () => {
    const { token } = await createApiToken(seed.memberId, {
      name: "member token",
      scopes: ["read"],
    });
    const verified = await verifyApiToken(token);
    expect(verified).not.toBeNull();
    expect(verified!.user.id).toBe(seed.memberId);
    expect(verified!.user.workspaceId).toBe(seed.workspaceId);
    expect(verified!.user.role).toBe("MEMBER");
    expect(verified!.scopes).toEqual(["read"]);
  });

  it("rejects garbage, wrong-prefix, and unknown tokens", async () => {
    expect(await verifyApiToken("nonsense")).toBeNull();
    expect(await verifyApiToken("pk_" + "a".repeat(43))).toBeNull();
    expect(await verifyApiToken("kb_" + "a".repeat(43))).toBeNull();
  });

  it("rejects revoked tokens", async () => {
    const { token, record } = await createApiToken(seed.adminId, {
      name: "soon revoked",
      scopes: ["write"],
    });
    expect(await verifyApiToken(token)).not.toBeNull();
    await revokeApiToken(seed.adminId, record.id);
    expect(await verifyApiToken(token)).toBeNull();
  });

  it("rejects expired tokens and accepts future expiries", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const expired = await createApiToken(seed.adminId, {
      name: "expired",
      scopes: ["read"],
      expiresAt: past,
    });
    const living = await createApiToken(seed.adminId, {
      name: "living",
      scopes: ["read"],
      expiresAt: future,
    });
    expect(await verifyApiToken(expired.token)).toBeNull();
    expect(await verifyApiToken(living.token)).not.toBeNull();
  });

  it("bumps lastUsedAt on use", async () => {
    const { token, record } = await createApiToken(seed.adminId, {
      name: "hot",
      scopes: ["read"],
    });
    expect(record.lastUsedAt).toBeNull();
    await verifyApiToken(token);
    // fire-and-forget write — give it a beat
    await new Promise((r) => setTimeout(r, 100));
    const row = await prisma.apiToken.findUniqueOrThrow({ where: { id: record.id } });
    expect(row.lastUsedAt).not.toBeNull();
  });
});

describe("revokeApiToken", () => {
  it("only the owner can revoke — foreign tokens report not-found", async () => {
    const { record } = await createApiToken(seed.adminId, {
      name: "admin's",
      scopes: ["read"],
    });
    expect(await revokeApiToken(seed.memberId, record.id)).toBe(false);
    expect(await revokeApiToken(seed.adminId, record.id)).toBe(true);
    // idempotent: second revoke is a no-op "false"
    expect(await revokeApiToken(seed.adminId, record.id)).toBe(false);
  });
});
