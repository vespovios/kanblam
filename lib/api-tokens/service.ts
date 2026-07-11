import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import {
  API_TOKENS_PER_USER_MAX,
  type CreateApiTokenInput,
} from "@/lib/validators/api-token";

/**
 * Personal access tokens for the public REST API (/api/v1).
 *
 * Format: `kb_` + 32 random bytes base64url (43 chars) — 46 chars total.
 * Storage: SHA-256 hex of the full raw token, unique-indexed. The raw token
 * exists exactly once, in the create response. `tokenPrefix` (kb_ + first 8
 * random chars) is retained for the Settings list so users can tell tokens
 * apart without us keeping anything secret-shaped.
 *
 * A token acts AS ITS USER: verification resolves to the owning user row,
 * so workspace scoping and role checks downstream are identical to a
 * session request. Revocation is a tombstone (`revokedAt`), not a delete —
 * the Settings list can show revoked-when for auditability.
 */

const TOKEN_PREFIX = "kb_";
const PREFIX_DISPLAY_LEN = TOKEN_PREFIX.length + 8;

const hashToken = (raw: string): string =>
  createHash("sha256").update(raw).digest("hex");

/** Fields safe to return to the Settings UI — never the hash. */
const TOKEN_SELECT = {
  id: true,
  name: true,
  tokenPrefix: true,
  scopes: true,
  expiresAt: true,
  lastUsedAt: true,
  revokedAt: true,
  createdAt: true,
} as const;

export async function createApiToken(userId: string, input: CreateApiTokenInput) {
  const activeCount = await prisma.apiToken.count({
    where: { userId, revokedAt: null },
  });
  if (activeCount >= API_TOKENS_PER_USER_MAX) {
    throw new Error(
      `Token limit reached (${API_TOKENS_PER_USER_MAX}). Revoke one you no longer use first.`,
    );
  }

  const raw = TOKEN_PREFIX + randomBytes(32).toString("base64url");
  const record = await prisma.apiToken.create({
    data: {
      userId,
      name: input.name,
      tokenPrefix: raw.slice(0, PREFIX_DISPLAY_LEN),
      tokenHash: hashToken(raw),
      scopes: input.scopes,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    },
    select: TOKEN_SELECT,
  });

  // The one and only time the raw token leaves the server.
  return { token: raw, record };
}

export async function listApiTokens(userId: string) {
  return prisma.apiToken.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: TOKEN_SELECT,
  });
}

/** Revoke (tombstone) a token. Scoped to the owner — returns false when the
 *  token doesn't exist or belongs to someone else (indistinguishable on
 *  purpose). Idempotent: revoking twice is fine. */
export async function revokeApiToken(userId: string, tokenId: string): Promise<boolean> {
  const { count } = await prisma.apiToken.updateMany({
    where: { id: tokenId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return count > 0;
}

export interface VerifiedApiToken {
  tokenId: string;
  scopes: string[];
  user: {
    id: string;
    workspaceId: string;
    role: "ADMIN" | "MEMBER";
    name: string | null;
    email: string;
  };
}

/** Resolve a raw bearer token to its user, or null (bad/revoked/expired).
 *  Lookup is by SHA-256 hash — exact unique-index match, no user-supplied
 *  data ever reaches a query as a pattern. Bumps `lastUsedAt` at most once
 *  a minute (fire-and-forget) so hot tokens don't turn every API call into
 *  a write. */
export async function verifyApiToken(raw: string): Promise<VerifiedApiToken | null> {
  if (!raw.startsWith(TOKEN_PREFIX)) return null;

  const token = await prisma.apiToken.findUnique({
    where: { tokenHash: hashToken(raw) },
    select: {
      id: true,
      scopes: true,
      expiresAt: true,
      revokedAt: true,
      lastUsedAt: true,
      user: {
        select: { id: true, workspaceId: true, role: true, name: true, email: true },
      },
    },
  });
  if (!token) return null;
  if (token.revokedAt) return null;
  if (token.expiresAt && token.expiresAt.getTime() <= Date.now()) return null;

  const now = Date.now();
  if (!token.lastUsedAt || now - token.lastUsedAt.getTime() > 60_000) {
    prisma.apiToken
      .update({ where: { id: token.id }, data: { lastUsedAt: new Date(now) } })
      .catch(() => {}); // observability nicety — never fail the request over it
  }

  return { tokenId: token.id, scopes: token.scopes, user: token.user };
}
