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
    user: {
      id: seed.adminId,
      email: "admin@test.local",
      workspaceId: seed.workspaceId,
      role: "ADMIN",
    },
    expires: new Date(Date.now() + 86400_000).toISOString(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/tags", () => {
  it("creates a tag and returns 201", async () => {
    const { POST } = await import("@/app/api/tags/route");
    const res = await POST(
      new Request("http://localhost/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "marketing" }),
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.tag.name).toBe("marketing");
    expect(body.tag.color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it("returns 409 on case-insensitive duplicate", async () => {
    const { POST } = await import("@/app/api/tags/route");
    await POST(
      new Request("http://localhost/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Marketing" }),
      }),
    );
    const res = await POST(
      new Request("http://localhost/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "marketing" }),
      }),
    );
    expect(res.status).toBe(409);
  });

  it("returns 400 on invalid name", async () => {
    const { POST } = await import("@/app/api/tags/route");
    const res = await POST(
      new Request("http://localhost/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "site relaunch" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(auth).mockResolvedValue(null as any);
    const { POST } = await import("@/app/api/tags/route");
    const res = await POST(
      new Request("http://localhost/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "marketing" }),
      }),
    );
    expect(res.status).toBe(401);
  });
});

describe("GET /api/tags", () => {
  it("returns workspace tags with usage counts", async () => {
    await prisma.tag.create({
      data: { workspaceId: seed.workspaceId, name: "alpha", color: "#fce7e7" },
    });
    await prisma.tag.create({
      data: { workspaceId: seed.workspaceId, name: "beta", color: "#fcedc7" },
    });
    const { GET } = await import("@/app/api/tags/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tags.map((t: { name: string }) => t.name)).toEqual(["alpha", "beta"]);
    expect(body.tags[0]._count.tasks).toBe(0);
  });
});

describe("PATCH /api/tags/[id]", () => {
  it("renames a tag", async () => {
    const t = await prisma.tag.create({
      data: { workspaceId: seed.workspaceId, name: "old", color: "#fce7e7" },
    });
    const { PATCH } = await import("@/app/api/tags/[id]/route");
    const res = await PATCH(
      new Request(`http://localhost/api/tags/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "new" }),
      }),
      { params: Promise.resolve({ id: t.id }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tag.name).toBe("new");
  });

  it("returns 404 for a tag in a different workspace", async () => {
    const otherWs = await prisma.workspace.create({ data: { name: "Other" } });
    const otherTag = await prisma.tag.create({
      data: { workspaceId: otherWs.id, name: "outsider", color: "#fce7e7" },
    });
    const { PATCH } = await import("@/app/api/tags/[id]/route");
    const res = await PATCH(
      new Request(`http://localhost/api/tags/${otherTag.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "stolen" }),
      }),
      { params: Promise.resolve({ id: otherTag.id }) },
    );
    expect(res.status).toBe(404);
  });

  it("accepts empty body as no-op (returns 200 with unchanged tag)", async () => {
    const t = await prisma.tag.create({
      data: { workspaceId: seed.workspaceId, name: "stable", color: "#fce7e7" },
    });
    const { PATCH } = await import("@/app/api/tags/[id]/route");
    const res = await PATCH(
      new Request(`http://localhost/api/tags/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: t.id }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tag.name).toBe("stable");
    expect(body.tag.color).toBe("#fce7e7");
  });
});

describe("DELETE /api/tags/[id]", () => {
  it("deletes a tag", async () => {
    const t = await prisma.tag.create({
      data: { workspaceId: seed.workspaceId, name: "doomed", color: "#fce7e7" },
    });
    const { DELETE } = await import("@/app/api/tags/[id]/route");
    const res = await DELETE(new Request(`http://localhost/api/tags/${t.id}`), {
      params: Promise.resolve({ id: t.id }),
    });
    expect(res.status).toBe(200);
    const count = await prisma.tag.count({ where: { id: t.id } });
    expect(count).toBe(0);
  });
});
