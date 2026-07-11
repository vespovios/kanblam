import { describe, it, expect, beforeEach, afterAll, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { setupTestWorkspace, type SeededWorkspace } from "@/tests/integration/helpers/workspace";
import { createApiToken, revokeApiToken } from "@/lib/api-tokens/service";
import { _resetRateLimiter } from "@/lib/api/rate-limit";
import { GET as getWorkspace } from "@/app/api/v1/workspace/route";
import { GET as getStages } from "@/app/api/v1/stages/route";
import { GET as getMembers } from "@/app/api/v1/members/route";

const prisma = new PrismaClient();
let seed: SeededWorkspace;

const req = (token?: string) =>
  new Request("http://localhost/api/v1/x", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
const extra = { params: Promise.resolve({}) };

beforeEach(async () => {
  seed = await setupTestWorkspace(prisma);
  _resetRateLimiter();
});

afterEach(() => {
  delete process.env.API_RATE_LIMIT_PER_MIN;
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function mintToken(userId: string, scopes: ("read" | "write")[] = ["read"]) {
  const { token, record } = await createApiToken(userId, { name: "test", scopes });
  return { token, id: record.id };
}

describe("authentication", () => {
  it("401 without a token, with a malformed header, and with an unknown token", async () => {
    for (const r of [
      req(),
      new Request("http://localhost/x", { headers: { authorization: "Basic abc" } }),
      req("kb_" + "a".repeat(43)),
    ]) {
      const res = await getWorkspace(r, extra);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe("unauthorized");
    }
  });

  it("401 after revocation", async () => {
    const { token, id } = await mintToken(seed.adminId);
    expect((await getWorkspace(req(token), extra)).status).toBe(200);
    await revokeApiToken(seed.adminId, id);
    expect((await getWorkspace(req(token), extra)).status).toBe(401);
  });

  it("403 with the wrong scope, envelope code 'forbidden'", async () => {
    const { token } = await mintToken(seed.adminId, ["write"]);
    const res = await getStages(req(token), extra);
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("forbidden");
  });
});

describe("workspace scoping", () => {
  it("returns only the token's workspace data", async () => {
    // second workspace with its own stage — must never leak
    const other = await prisma.workspace.create({ data: { name: "Other" } });
    await prisma.kanbanStage.create({
      data: { workspaceId: other.id, name: "Alien Stage", color: "#000000", order: 1, isTerminal: false },
    });

    const { token } = await mintToken(seed.memberId);
    const ws = await (await getWorkspace(req(token), extra)).json();
    expect(ws.workspace.id).toBe(seed.workspaceId);

    const stages = await (await getStages(req(token), extra)).json();
    const names = stages.stages.map((s: { name: string }) => s.name);
    expect(names).toContain("Backlog");
    expect(names).not.toContain("Alien Stage");
  });

  it("members endpoint exposes id and name only", async () => {
    const { token } = await mintToken(seed.adminId);
    const body = await (await getMembers(req(token), extra)).json();
    expect(body.members.length).toBe(2);
    for (const m of body.members) {
      expect(Object.keys(m).sort()).toEqual(["id", "name"]);
    }
  });
});

describe("rate limiting", () => {
  it("429 with Retry-After once the per-token window is exhausted", async () => {
    process.env.API_RATE_LIMIT_PER_MIN = "3";
    const { token } = await mintToken(seed.adminId);
    for (let i = 0; i < 3; i++) {
      expect((await getWorkspace(req(token), extra)).status).toBe(200);
    }
    const res = await getWorkspace(req(token), extra);
    expect(res.status).toBe(429);
    expect((await res.json()).error.code).toBe("rate_limited");
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("limits are per token, not global", async () => {
    process.env.API_RATE_LIMIT_PER_MIN = "2";
    const a = await mintToken(seed.adminId);
    const b = await mintToken(seed.memberId);
    expect((await getWorkspace(req(a.token), extra)).status).toBe(200);
    expect((await getWorkspace(req(a.token), extra)).status).toBe(200);
    expect((await getWorkspace(req(a.token), extra)).status).toBe(429);
    expect((await getWorkspace(req(b.token), extra)).status).toBe(200);
  });
});
