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

describe("POST /api/holidays", () => {
  it("creates a holiday and returns 201", async () => {
    const { POST } = await import("@/app/api/holidays/route");
    const res = await POST(
      new Request("http://localhost/api/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Christmas", date: "2026-12-25" }),
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.holiday.name).toBe("Christmas");
  });

  it("returns 400 on invalid input", async () => {
    const { POST } = await import("@/app/api/holidays/route");
    const res = await POST(
      new Request("http://localhost/api/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "", date: "not-a-date" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 409 on duplicate date in same workspace", async () => {
    const { POST } = await import("@/app/api/holidays/route");
    const make = () =>
      POST(
        new Request("http://localhost/api/holidays", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "A", date: "2026-12-25" }),
        }),
      );
    const first = await make();
    expect(first.status).toBe(201);
    const second = await make();
    expect(second.status).toBe(409);
  });
});

describe("GET /api/holidays", () => {
  it("lists only the current workspace's holidays", async () => {
    const other = await prisma.workspace.create({ data: { name: "Other" } });
    await prisma.holiday.create({
      data: { workspaceId: other.id, name: "Other", date: new Date("2026-06-01") },
    });
    await prisma.holiday.create({
      data: { workspaceId: seed.workspaceId, name: "Mine", date: new Date("2026-07-01") },
    });

    const { GET } = await import("@/app/api/holidays/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.holidays).toHaveLength(1);
    expect(body.holidays[0].name).toBe("Mine");
  });
});

describe("DELETE /api/holidays/[id]", () => {
  it("deletes and returns 200", async () => {
    const h = await prisma.holiday.create({
      data: { workspaceId: seed.workspaceId, name: "X", date: new Date("2026-08-01") },
    });
    const { DELETE } = await import("@/app/api/holidays/[id]/route");
    const res = await DELETE(new Request("http://localhost/api/holidays/" + h.id, { method: "DELETE" }), {
      params: Promise.resolve({ id: h.id }),
    });
    expect(res.status).toBe(200);
  });

  it("returns 404 for unknown id", async () => {
    const { DELETE } = await import("@/app/api/holidays/[id]/route");
    const res = await DELETE(new Request("http://localhost/api/holidays/nope", { method: "DELETE" }), {
      params: Promise.resolve({ id: "nope" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("admin authorization", () => {
  function mockMember() {
    vi.mocked(auth).mockResolvedValue({
      user: { id: seed.memberId, email: "member@test.local", workspaceId: seed.workspaceId, role: "MEMBER" },
      expires: new Date(Date.now() + 86400_000).toISOString(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  }

  it("POST /api/holidays returns 403 for non-admin", async () => {
    mockMember();
    const { POST } = await import("@/app/api/holidays/route");
    const res = await POST(
      new Request("http://localhost/api/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Christmas", date: "2026-12-25" }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("DELETE /api/holidays/[id] returns 403 for non-admin", async () => {
    const h = await prisma.holiday.create({
      data: { workspaceId: seed.workspaceId, name: "X", date: new Date("2026-08-01") },
    });
    mockMember();
    const { DELETE } = await import("@/app/api/holidays/[id]/route");
    const res = await DELETE(new Request("http://localhost/api/holidays/" + h.id, { method: "DELETE" }), {
      params: Promise.resolve({ id: h.id }),
    });
    expect(res.status).toBe(403);
  });

  it("GET /api/holidays still returns 200 for non-admin (members can read)", async () => {
    mockMember();
    const { GET } = await import("@/app/api/holidays/route");
    const res = await GET();
    expect(res.status).toBe(200);
  });
});
