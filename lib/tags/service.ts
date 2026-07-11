import { prisma } from "@/lib/db";
import { colorFromName } from "@/lib/tags/color";
import type { CreateTagInput, UpdateTagInput } from "@/lib/validators/tag";

async function tagInWorkspace(workspaceId: string, tagId: string): Promise<boolean> {
  const t = await prisma.tag.findFirst({ where: { id: tagId, workspaceId }, select: { id: true } });
  return t !== null;
}

/**
 * Defense-in-depth guard against cross-workspace tag attachment.
 *
 * Callers (createTask, updateTask, createTemplate, updateTemplate) must invoke
 * this before passing tagIds to Prisma `connect`/`set`. The check rejects any
 * IDs that don't belong to the same workspace, so an API caller with a foreign
 * tag ID can't smuggle it onto a task or template.
 *
 * Empty input is a no-op (empty arrays are a legitimate "clear all" signal).
 */
export async function assertTagsInWorkspace(
  workspaceId: string,
  tagIds: readonly string[],
): Promise<void> {
  if (tagIds.length === 0) return;
  const found = await prisma.tag.findMany({
    where: { id: { in: [...tagIds] }, workspaceId },
    select: { id: true },
  });
  if (found.length !== tagIds.length) {
    throw new Error("Tag IDs not in workspace");
  }
}

export async function listTags(workspaceId: string) {
  return prisma.tag.findMany({
    where: { workspaceId },
    include: { _count: { select: { tasks: true } } },
    orderBy: { name: "asc" },
  });
}

export async function createTag(workspaceId: string, input: CreateTagInput) {
  // Case-insensitive uniqueness check (the DB unique is exact-match because
  // Postgres collation defaults are case-sensitive; we enforce CI here).
  const existing = await prisma.tag.findFirst({
    where: {
      workspaceId,
      name: { equals: input.name, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (existing) {
    throw new Error(`Tag "${input.name}" already exists in this workspace`);
  }

  return prisma.tag.create({
    data: {
      workspaceId,
      name: input.name,
      color: colorFromName(input.name),
    },
  });
}

export async function updateTag(workspaceId: string, tagId: string, input: UpdateTagInput) {
  if (!(await tagInWorkspace(workspaceId, tagId))) return null;

  // If renaming, check the new name doesn't collide CI with another tag.
  if (input.name !== undefined) {
    const collision = await prisma.tag.findFirst({
      where: {
        workspaceId,
        name: { equals: input.name, mode: "insensitive" },
        NOT: { id: tagId },
      },
      select: { id: true },
    });
    if (collision) {
      throw new Error(`Tag "${input.name}" already exists in this workspace`);
    }
  }

  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.color !== undefined) data.color = input.color;

  return prisma.tag.update({ where: { id: tagId }, data });
}

export async function deleteTag(workspaceId: string, tagId: string): Promise<boolean> {
  if (!(await tagInWorkspace(workspaceId, tagId))) return false;
  await prisma.tag.delete({ where: { id: tagId } });
  return true;
}
