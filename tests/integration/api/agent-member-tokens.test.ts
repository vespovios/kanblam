import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { setupTestWorkspace, type SeededWorkspace } from "../helpers/workspace";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
import { POST as mintRoute } from "@/app/api/settings/agent-members/[id]/tokens/route";
import { DELETE as revokeRoute } from "@/app/api/settings/agent-members/[id]/tokens/[tokenId]/route";
import { createAgentMember } from "@/lib/agent-members/service";

const prisma = new PrismaClient();
let seed: SeededWorkspace;

function asUser(id: string, role: "ADMIN" | "MEMBER", workspaceId: string) {
  vi.mocked(auth).mockResolvedValue({
    user: { id, email: `${role}@api.test`, workspaceId, role },
    expires: new Date(Date.now() + 86400_000).toISOString(),
  } as any);
}
const jsonReq = (body: unknown, method = "POST") =>
  new Request("http://localhost/api/settings/agent-members/x/tokens", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(async () => {
  seed = await setupTestWorkspace(prisma);
});
afterAll(() => prisma.$disconnect());

describe("agent token minting", () => {
  it("201 mints a kb_ token owned by the agent", async () => {
    const agent = await createAgentMember(seed.workspaceId, { name: "A" });
    asUser(seed.adminId, "ADMIN", seed.workspaceId);
    const res = await mintRoute(jsonReq({ name: "loop", scopes: ["read", "write"] }), {
      params: Promise.resolve({ id: agent.id }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.token).toMatch(/^kb_/);
    expect(body.record.scopes).toEqual(["read", "write"]);
    const row = await prisma.apiToken.findUniqueOrThrow({ where: { id: body.record.id } });
    expect(row.userId).toBe(agent.id);
  });

  it("404 for a HUMAN member id (no minting on behalf of humans)", async () => {
    asUser(seed.adminId, "ADMIN", seed.workspaceId);
    const res = await mintRoute(jsonReq({ name: "x", scopes: ["read"] }), {
      params: Promise.resolve({ id: seed.memberId }),
    });
    expect(res.status).toBe(404);
  });

  it("403 for non-admins", async () => {
    const agent = await createAgentMember(seed.workspaceId, { name: "A" });
    asUser(seed.memberId, "MEMBER", seed.workspaceId);
    const res = await mintRoute(jsonReq({ name: "x", scopes: ["read"] }), {
      params: Promise.resolve({ id: agent.id }),
    });
    expect(res.status).toBe(403);
  });

  it("403 when the JWT says ADMIN but the DB row was demoted (fresh-role check)", async () => {
    const agent = await createAgentMember(seed.workspaceId, { name: "A" });
    await prisma.user.update({ where: { id: seed.adminId }, data: { role: "MEMBER" } });
    asUser(seed.adminId, "ADMIN", seed.workspaceId); // stale JWT still claims ADMIN
    const res = await mintRoute(jsonReq({ name: "x", scopes: ["read"] }), {
      params: Promise.resolve({ id: agent.id }),
    });
    expect(res.status).toBe(403);
    expect(await prisma.apiToken.count({ where: { userId: agent.id } })).toBe(0);
  });
});

describe("agent token revocation", () => {
  it("200 revokes; revoked token row is tombstoned", async () => {
    const agent = await createAgentMember(seed.workspaceId, { name: "A" });
    asUser(seed.adminId, "ADMIN", seed.workspaceId);
    const mint = await mintRoute(jsonReq({ name: "t", scopes: ["read"] }), {
      params: Promise.resolve({ id: agent.id }),
    });
    const { record } = await mint.json();
    const res = await revokeRoute(jsonReq(null, "DELETE"), {
      params: Promise.resolve({ id: agent.id, tokenId: record.id }),
    });
    expect(res.status).toBe(200);
    const row = await prisma.apiToken.findUniqueOrThrow({ where: { id: record.id } });
    expect(row.revokedAt).not.toBeNull();
  });
});
