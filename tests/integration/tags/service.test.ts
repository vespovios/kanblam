import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { setupTestWorkspace, type SeededWorkspace } from "@/tests/integration/helpers/workspace";
import { listTags, createTag, updateTag, deleteTag } from "@/lib/tags/service";

const prisma = new PrismaClient();
let seed: SeededWorkspace;

beforeEach(async () => {
  seed = await setupTestWorkspace(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("createTag", () => {
  it("creates a tag with auto-derived color", async () => {
    const t = await createTag(seed.workspaceId, { name: "marketing" });
    expect(t).not.toBeNull();
    expect(t!.name).toBe("marketing");
    expect(t!.color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it("preserves casing on the name field", async () => {
    const t = await createTag(seed.workspaceId, { name: "GTD" });
    expect(t!.name).toBe("GTD");
  });

  it("rejects case-insensitive duplicates", async () => {
    await createTag(seed.workspaceId, { name: "Marketing" });
    await expect(createTag(seed.workspaceId, { name: "MARKETING" })).rejects.toThrow(
      /already exists/i,
    );
    await expect(createTag(seed.workspaceId, { name: "marketing" })).rejects.toThrow(
      /already exists/i,
    );
  });

  it("allows the same name in different workspaces", async () => {
    const other = await prisma.workspace.create({ data: { name: "Other" } });
    await createTag(seed.workspaceId, { name: "shared" });
    const otherTag = await createTag(other.id, { name: "shared" });
    expect(otherTag).not.toBeNull();
  });
});

describe("listTags", () => {
  it("returns workspace-scoped tags ordered by name", async () => {
    await createTag(seed.workspaceId, { name: "zebra" });
    await createTag(seed.workspaceId, { name: "apple" });
    await createTag(seed.workspaceId, { name: "mango" });
    const tags = await listTags(seed.workspaceId);
    expect(tags.map((t) => t.name)).toEqual(["apple", "mango", "zebra"]);
  });

  it("includes _count.tasks for usage count", async () => {
    const t = await createTag(seed.workspaceId, { name: "marketing" });
    // Create a task and connect the tag.
    const project = await prisma.project.create({
      data: { workspaceId: seed.workspaceId, name: "P", code: "P1", statusId: seed.statusIds.notStarted },
    });
    await prisma.task.create({
      data: {
        workspaceId: seed.workspaceId,
        projectId: project.id,
        name: "Task 1",
        priorityId: seed.priorityIds.medium,
        kanbanStageId: seed.kanbanStageIds.backlog,
        tags: { connect: [{ id: t!.id }] },
      },
    });
    const tags = await listTags(seed.workspaceId);
    expect(tags[0]._count.tasks).toBe(1);
  });

  it("does not leak tags across workspaces", async () => {
    const other = await prisma.workspace.create({ data: { name: "Other" } });
    await createTag(seed.workspaceId, { name: "mine" });
    await createTag(other.id, { name: "theirs" });
    const tags = await listTags(seed.workspaceId);
    expect(tags.map((t) => t.name)).toEqual(["mine"]);
  });
});

describe("updateTag", () => {
  it("renames a tag", async () => {
    const t = await createTag(seed.workspaceId, { name: "old" });
    const updated = await updateTag(seed.workspaceId, t!.id, { name: "new" });
    expect(updated?.name).toBe("new");
  });

  it("recolors a tag", async () => {
    const t = await createTag(seed.workspaceId, { name: "x" });
    const updated = await updateTag(seed.workspaceId, t!.id, { color: "#abcdef" });
    expect(updated?.color).toBe("#abcdef");
  });

  it("returns null for cross-workspace tag id", async () => {
    const other = await prisma.workspace.create({ data: { name: "Other" } });
    const otherTag = await prisma.tag.create({
      data: { workspaceId: other.id, name: "x", color: "#ffffff" },
    });
    const got = await updateTag(seed.workspaceId, otherTag.id, { name: "hacked" });
    expect(got).toBeNull();
  });

  it("rename does NOT change the color", async () => {
    const t = await createTag(seed.workspaceId, { name: "alpha" });
    const original = t!.color;
    const updated = await updateTag(seed.workspaceId, t!.id, { name: "beta" });
    expect(updated?.color).toBe(original);
  });
});

describe("deleteTag", () => {
  it("deletes a tag and removes M2M join rows (tasks survive)", async () => {
    const t = await createTag(seed.workspaceId, { name: "doomed" });
    const project = await prisma.project.create({
      data: { workspaceId: seed.workspaceId, name: "P", code: "P1", statusId: seed.statusIds.notStarted },
    });
    const task = await prisma.task.create({
      data: {
        workspaceId: seed.workspaceId,
        projectId: project.id,
        name: "T1",
        priorityId: seed.priorityIds.medium,
        kanbanStageId: seed.kanbanStageIds.backlog,
        tags: { connect: [{ id: t!.id }] },
      },
    });

    expect(await deleteTag(seed.workspaceId, t!.id)).toBe(true);

    const stillThere = await prisma.task.findUnique({
      where: { id: task.id },
      include: { tags: true },
    });
    expect(stillThere).not.toBeNull();
    expect(stillThere!.tags).toEqual([]);
  });

  it("returns false for cross-workspace id", async () => {
    const other = await prisma.workspace.create({ data: { name: "Other" } });
    const otherTag = await prisma.tag.create({
      data: { workspaceId: other.id, name: "x", color: "#ffffff" },
    });
    expect(await deleteTag(seed.workspaceId, otherTag.id)).toBe(false);
  });
});
