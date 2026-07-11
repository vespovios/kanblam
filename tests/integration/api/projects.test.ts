import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { setupTestWorkspace, type SeededWorkspace } from "@/tests/integration/helpers/workspace";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
import { GET, POST } from "@/app/api/projects/route";

const prisma = new PrismaClient();
let seed: SeededWorkspace;

beforeEach(async () => {
  seed = await setupTestWorkspace(prisma);
  vi.mocked(auth).mockResolvedValue({
    user: { id: seed.adminId, email: "admin@test.local", workspaceId: seed.workspaceId, role: "ADMIN" },
    expires: new Date(Date.now() + 86400_000).toISOString(),
  } as any);
});

afterAll(async () => {
  await prisma.$disconnect();
});

function postRequest(body: unknown) {
  return new Request("http://localhost/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/projects", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns the workspace's projects", async () => {
    await prisma.project.create({
      data: { workspaceId: seed.workspaceId, name: "Website", code: "P01", statusId: seed.statusIds.notStarted },
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.projects).toHaveLength(1);
    expect(body.projects[0].name).toBe("Website");
  });
});

describe("POST /api/projects", () => {
  it("creates a project and returns 201", async () => {
    const res = await POST(postRequest({
      name: "New",
      code: "P01",
      statusId: seed.statusIds.notStarted,
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.project.name).toBe("New");
    const count = await prisma.project.count({ where: { workspaceId: seed.workspaceId } });
    expect(count).toBe(1);
  });

  it("returns 400 on invalid input", async () => {
    const res = await POST(postRequest({ name: "", code: "P01", statusId: seed.statusIds.notStarted }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when code already exists in workspace", async () => {
    await prisma.project.create({
      data: { workspaceId: seed.workspaceId, name: "A", code: "P01", statusId: seed.statusIds.notStarted },
    });
    const res = await POST(postRequest({ name: "B", code: "P01", statusId: seed.statusIds.notStarted }));
    expect(res.status).toBe(400);
  });
});
