import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { setupTestWorkspace, type SeededWorkspace } from "@/tests/integration/helpers/workspace";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
import { GET, PATCH, DELETE } from "@/app/api/projects/[id]/route";

const prisma = new PrismaClient();
let seed: SeededWorkspace;
let projectId: string;

beforeEach(async () => {
  seed = await setupTestWorkspace(prisma);
  vi.mocked(auth).mockResolvedValue({
    user: { id: seed.adminId, email: "admin@test.local", workspaceId: seed.workspaceId, role: "ADMIN" },
    expires: new Date(Date.now() + 86400_000).toISOString(),
  } as any);
  const p = await prisma.project.create({
    data: { workspaceId: seed.workspaceId, name: "Existing", code: "P01", statusId: seed.statusIds.notStarted },
  });
  projectId = p.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/projects/[id]", () => {
  it("returns the project", async () => {
    const res = await GET(new Request(`http://localhost/api/projects/${projectId}`), ctx(projectId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.project.id).toBe(projectId);
  });

  it("returns 404 for unknown id", async () => {
    const res = await GET(new Request("http://localhost/api/projects/nope"), ctx("nope"));
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/projects/[id]", () => {
  it("updates the project", async () => {
    const res = await PATCH(
      new Request(`http://localhost/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Renamed" }),
      }),
      ctx(projectId),
    );
    expect(res.status).toBe(200);
    const updated = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(updated.name).toBe("Renamed");
  });

  it("returns 400 on invalid patch", async () => {
    const res = await PATCH(
      new Request(`http://localhost/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "" }),
      }),
      ctx(projectId),
    );
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/projects/[id]", () => {
  it("deletes the project", async () => {
    const res = await DELETE(new Request(`http://localhost/api/projects/${projectId}`), ctx(projectId));
    expect(res.status).toBe(200);
    const after = await prisma.project.findUnique({ where: { id: projectId } });
    expect(after).toBeNull();
  });

  it("returns 404 for unknown id", async () => {
    const res = await DELETE(new Request("http://localhost/api/projects/nope"), ctx("nope"));
    expect(res.status).toBe(404);
  });
});
