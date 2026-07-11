import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { setupTestWorkspace, type SeededWorkspace } from "@/tests/integration/helpers/workspace";
import {
  createProject,
  listProjects,
  getProject,
  updateProject,
  deleteProject,
} from "@/lib/projects/service";

const prisma = new PrismaClient();
let seed: SeededWorkspace;

beforeEach(async () => {
  seed = await setupTestWorkspace(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("createProject", () => {
  it("creates a project scoped to the workspace", async () => {
    const p = await createProject(seed.workspaceId, {
      name: "Website",
      code: "P01",
      statusId: seed.statusIds.notStarted,
    });
    expect(p.name).toBe("Website");
    expect(p.workspaceId).toBe(seed.workspaceId);
    expect(p.statusId).toBe(seed.statusIds.notStarted);
  });

  it("rejects duplicate code in same workspace", async () => {
    await createProject(seed.workspaceId, { name: "A", code: "P01", statusId: seed.statusIds.notStarted });
    await expect(
      createProject(seed.workspaceId, { name: "B", code: "P01", statusId: seed.statusIds.notStarted }),
    ).rejects.toThrow();
  });
});

describe("listProjects", () => {
  it("returns only this workspace's projects", async () => {
    await createProject(seed.workspaceId, { name: "Mine", code: "P01", statusId: seed.statusIds.notStarted });

    // Another workspace
    const other = await prisma.workspace.create({ data: { name: "Other" } });
    const otherStatus = await prisma.status.create({
      data: { workspaceId: other.id, name: "Not Started", color: "#ccc", order: 1 },
    });
    await prisma.project.create({
      data: { workspaceId: other.id, name: "Theirs", code: "P01", statusId: otherStatus.id },
    });

    const rows = await listProjects(seed.workspaceId);
    expect(rows.map((r) => r.name)).toEqual(["Mine"]);
  });
});

describe("getProject", () => {
  it("returns the project when it belongs to the workspace", async () => {
    const p = await createProject(seed.workspaceId, {
      name: "X",
      code: "P01",
      statusId: seed.statusIds.notStarted,
    });
    const got = await getProject(seed.workspaceId, p.id);
    expect(got?.id).toBe(p.id);
  });

  it("returns null when the project is in a different workspace", async () => {
    const other = await prisma.workspace.create({ data: { name: "Other" } });
    const otherStatus = await prisma.status.create({
      data: { workspaceId: other.id, name: "s", color: "#ccc", order: 1 },
    });
    const p = await prisma.project.create({
      data: { workspaceId: other.id, name: "Theirs", code: "P01", statusId: otherStatus.id },
    });
    const got = await getProject(seed.workspaceId, p.id);
    expect(got).toBeNull();
  });
});

describe("updateProject", () => {
  it("updates fields on a project owned by the workspace", async () => {
    const p = await createProject(seed.workspaceId, {
      name: "Old",
      code: "P01",
      statusId: seed.statusIds.notStarted,
    });
    const updated = await updateProject(seed.workspaceId, p.id, { name: "New" });
    expect(updated?.name).toBe("New");
  });

  it("returns null for cross-workspace attempts", async () => {
    const other = await prisma.workspace.create({ data: { name: "Other" } });
    const otherStatus = await prisma.status.create({
      data: { workspaceId: other.id, name: "s", color: "#ccc", order: 1 },
    });
    const p = await prisma.project.create({
      data: { workspaceId: other.id, name: "Theirs", code: "P01", statusId: otherStatus.id },
    });
    const got = await updateProject(seed.workspaceId, p.id, { name: "Hacked" });
    expect(got).toBeNull();
  });
});

describe("deleteProject", () => {
  it("deletes a project in the workspace", async () => {
    const p = await createProject(seed.workspaceId, {
      name: "Doomed",
      code: "P01",
      statusId: seed.statusIds.notStarted,
    });
    const ok = await deleteProject(seed.workspaceId, p.id);
    expect(ok).toBe(true);
    const after = await prisma.project.findUnique({ where: { id: p.id } });
    expect(after).toBeNull();
  });

  it("returns false for cross-workspace attempts", async () => {
    const other = await prisma.workspace.create({ data: { name: "Other" } });
    const otherStatus = await prisma.status.create({
      data: { workspaceId: other.id, name: "s", color: "#ccc", order: 1 },
    });
    const p = await prisma.project.create({
      data: { workspaceId: other.id, name: "Safe", code: "P01", statusId: otherStatus.id },
    });
    const ok = await deleteProject(seed.workspaceId, p.id);
    expect(ok).toBe(false);
    const after = await prisma.project.findUnique({ where: { id: p.id } });
    expect(after).not.toBeNull();
  });
});
