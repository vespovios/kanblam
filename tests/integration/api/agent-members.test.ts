// Route-level tests, session mocked — same pattern as tests/integration/api/invite.test.ts
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { setupTestWorkspace, type SeededWorkspace } from "../helpers/workspace";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
import { POST as createRoute } from "@/app/api/settings/agent-members/route";
import { PATCH as renameRoute, DELETE as removeRoute } from "@/app/api/settings/agent-members/[id]/route";
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
  new Request("http://localhost/api/settings/agent-members", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(async () => {
  seed = await setupTestWorkspace(prisma);
  delete process.env.AGENT_MEMBERS_MAX;
});
afterAll(() => prisma.$disconnect());

describe("POST /api/settings/agent-members", () => {
  it("401 unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    expect((await createRoute(jsonReq({ name: "A" }))).status).toBe(401);
  });
  it("403 for members", async () => {
    asUser(seed.memberId, "MEMBER", seed.workspaceId);
    expect((await createRoute(jsonReq({ name: "A" }))).status).toBe(403);
  });
  it("400 on empty name", async () => {
    asUser(seed.adminId, "ADMIN", seed.workspaceId);
    expect((await createRoute(jsonReq({ name: " " }))).status).toBe(400);
  });
  it("201 creates for admins", async () => {
    asUser(seed.adminId, "ADMIN", seed.workspaceId);
    const res = await createRoute(jsonReq({ name: "Flight Computer" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.agent.kind).toBe("AGENT");
    expect(await prisma.user.count({ where: { workspaceId: seed.workspaceId, kind: "AGENT" } })).toBe(1);
  });
  it("400 at the cap", async () => {
    asUser(seed.adminId, "ADMIN", seed.workspaceId);
    for (let i = 0; i < 5; i++) await createAgentMember(seed.workspaceId, { name: `A${i}` });
    const res = await createRoute(jsonReq({ name: "six" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/limit/i);
  });
});

describe("PATCH/DELETE /api/settings/agent-members/[id]", () => {
  it("renames (200), 404 for humans, 403 for members", async () => {
    const agent = await createAgentMember(seed.workspaceId, { name: "Old" });
    asUser(seed.adminId, "ADMIN", seed.workspaceId);
    expect((await renameRoute(jsonReq({ name: "New" }, "PATCH"), params(agent.id))).status).toBe(200);
    expect((await renameRoute(jsonReq({ name: "X" }, "PATCH"), params(seed.memberId))).status).toBe(404);
    asUser(seed.memberId, "MEMBER", seed.workspaceId);
    expect((await renameRoute(jsonReq({ name: "X" }, "PATCH"), params(agent.id))).status).toBe(403);
  });
  it("removes (200) and 404s humans", async () => {
    const agent = await createAgentMember(seed.workspaceId, { name: "Doomed" });
    asUser(seed.adminId, "ADMIN", seed.workspaceId);
    expect((await removeRoute(jsonReq(null, "DELETE"), params(agent.id))).status).toBe(200);
    expect(await prisma.user.count({ where: { id: agent.id } })).toBe(0);
    expect((await removeRoute(jsonReq(null, "DELETE"), params(seed.memberId))).status).toBe(404);
  });
});
