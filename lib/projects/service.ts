import { prisma } from "@/lib/db";
import type { CreateProjectInput, UpdateProjectInput } from "@/lib/validators/project";

function toDate(v?: string | null): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  return new Date(v);
}

export async function createProject(workspaceId: string, input: CreateProjectInput) {
  return prisma.project.create({
    data: {
      workspaceId,
      name: input.name,
      code: input.code,
      statusId: input.statusId,
      startDate: toDate(input.startDate) ?? undefined,
      endDate: toDate(input.endDate) ?? undefined,
      projectLeadId: input.projectLeadId,
      clientName: input.clientName,
    },
  });
}

export async function listProjects(workspaceId: string) {
  return prisma.project.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    include: {
      status: true,
      projectLead: { select: { id: true, name: true, email: true } },
      _count: { select: { tasks: true } },
    },
  });
}

export async function getProject(workspaceId: string, id: string) {
  return prisma.project.findFirst({
    where: { id, workspaceId },
    include: {
      status: true,
      projectLead: { select: { id: true, name: true, email: true } },
      _count: { select: { tasks: true } },
    },
  });
}

export async function updateProject(
  workspaceId: string,
  id: string,
  input: UpdateProjectInput,
) {
  const existing = await prisma.project.findFirst({ where: { id, workspaceId }, select: { id: true } });
  if (!existing) return null;

  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.code !== undefined) data.code = input.code;
  if (input.statusId !== undefined) data.statusId = input.statusId;
  if (input.clientName !== undefined) data.clientName = input.clientName;
  if (input.projectLeadId !== undefined) data.projectLeadId = input.projectLeadId;
  if (input.startDate !== undefined) data.startDate = toDate(input.startDate);
  if (input.endDate !== undefined) data.endDate = toDate(input.endDate);

  return prisma.project.update({ where: { id }, data });
}

export async function deleteProject(workspaceId: string, id: string): Promise<boolean> {
  const result = await prisma.project.deleteMany({ where: { id, workspaceId } });
  return result.count > 0;
}
