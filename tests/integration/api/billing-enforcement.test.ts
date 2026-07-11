import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { setupTestWorkspace, type SeededWorkspace } from "@/tests/integration/helpers/workspace";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
// Mutable feature mirror so each test can flip billingEnabled without reloading
// modules (same pattern as the billing unit tests). The write route's
// enforcement seam reads this module at call time.
vi.mock("@/lib/config/features", () => ({ features: { billingEnabled: false } }));

import { auth } from "@/auth";
import { features } from "@/lib/config/features";
import { POST as createTaskRoute } from "@/app/api/tasks/route";
import { GET as listProjectsRoute } from "@/app/api/projects/route";

const prisma = new PrismaClient();
let seed: SeededWorkspace;
let projectId: string;

function setBilling(enabled: boolean) {
  (features as { billingEnabled: boolean }).billingEnabled = enabled;
}

beforeEach(async () => {
  seed = await setupTestWorkspace(prisma);
  const project = await prisma.project.create({
    data: { workspaceId: seed.workspaceId, name: "P", code: "P01", statusId: seed.statusIds.notStarted },
  });
  projectId = project.id;
  // Drive the workspace into the lapsed state at the data layer; individual
  // tests toggle BILLING_ENABLED to prove the gate is flag-gated.
  await prisma.workspaceBilling.create({
    data: { workspaceId: seed.workspaceId, status: "READ_ONLY" },
  });
  vi.mocked(auth).mockResolvedValue({
    user: { id: seed.adminId, email: "admin@test.local", workspaceId: seed.workspaceId, role: "ADMIN" },
    expires: new Date(Date.now() + 86400_000).toISOString(),
  } as any);
  setBilling(false);
});

afterAll(async () => {
  await prisma.$disconnect();
});

function createTaskRequest() {
  return new Request("http://localhost/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId,
      name: "T",
      priorityId: seed.priorityIds.high,
      kanbanStageId: seed.kanbanStageIds.backlog,
    }),
  });
}

describe("billing enforcement on wrapped write routes (READ_ONLY workspace)", () => {
  it("billing on + READ_ONLY ⇒ wrapped write (POST /api/tasks) returns 402", async () => {
    setBilling(true);
    const res = await createTaskRoute(createTaskRequest());
    expect(res.status).toBe(402);
    // The mutation never landed.
    const count = await prisma.task.count({ where: { workspaceId: seed.workspaceId } });
    expect(count).toBe(0);
  });

  it("billing on + READ_ONLY ⇒ read route (GET /api/projects) still returns 200", async () => {
    setBilling(true);
    const res = await listProjectsRoute();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.projects).toHaveLength(1);
  });

  it("self-host invariant: BILLING_ENABLED=false ⇒ the same wrapped write passes (201) despite READ_ONLY status", async () => {
    setBilling(false);
    const res = await createTaskRoute(createTaskRequest());
    expect(res.status).toBe(201);
    const count = await prisma.task.count({ where: { workspaceId: seed.workspaceId } });
    expect(count).toBe(1);
  });
});
