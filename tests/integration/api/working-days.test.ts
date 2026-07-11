import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { setupTestWorkspace, type SeededWorkspace } from "@/tests/integration/helpers/workspace";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";

const prisma = new PrismaClient();
let seed: SeededWorkspace;

beforeEach(async () => {
  seed = await setupTestWorkspace(prisma);
  vi.mocked(auth).mockResolvedValue({
    user: { id: seed.adminId, email: "admin@test.local", workspaceId: seed.workspaceId, role: "ADMIN" },
    expires: new Date(Date.now() + 86400_000).toISOString(),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("PATCH /api/settings/working-days", () => {
  it("updates workingDays on the workspace", async () => {
    const { PATCH } = await import("@/app/api/settings/working-days/route");
    const res = await PATCH(
      new Request("http://localhost/api/settings/working-days", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workingDays: [1, 2, 3, 4, 5, 6] }),
      }),
    );
    expect(res.status).toBe(200);
    const ws = await prisma.workspace.findUniqueOrThrow({ where: { id: seed.workspaceId } });
    expect(ws.workingDays).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("returns 400 for out-of-range values", async () => {
    const { PATCH } = await import("@/app/api/settings/working-days/route");
    const res = await PATCH(
      new Request("http://localhost/api/settings/working-days", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workingDays: [0, 8] }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 for non-admin caller", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: seed.memberId, email: "member@test.local", workspaceId: seed.workspaceId, role: "MEMBER" },
      expires: new Date(Date.now() + 86400_000).toISOString(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { PATCH } = await import("@/app/api/settings/working-days/route");
    const res = await PATCH(
      new Request("http://localhost/api/settings/working-days", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workingDays: [1, 2, 3] }),
      }),
    );
    expect(res.status).toBe(403);
  });
});
