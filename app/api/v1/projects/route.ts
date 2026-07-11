import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { apiHandler } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { serializeProject } from "@/lib/api/serialize";
import { createProjectSchema } from "@/lib/validators/project";
import { createProject, listProjects } from "@/lib/projects/service";
import { notifyWorkspace } from "@/lib/realtime/notify";
import { assertProjectRefsInWorkspace } from "@/lib/api/project-refs";

/** GET /api/v1/projects — all projects (workspaces hold dozens, not
 *  thousands; no pagination needed at this scale). */
export const GET = apiHandler("read", async (_req, ctx) => {
  const projects = await listProjects(ctx.workspaceId);
  return NextResponse.json({ projects: projects.map(serializeProject) });
});

/** POST /api/v1/projects — create. Omitted statusId defaults to the
 *  workspace's first (lowest-order) status, conventionally "Not Started". */
export const POST = apiHandler("write", async (req, ctx) => {
  const raw = (await req.json().catch(() => null)) ?? {};
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new ApiError("invalid_request", "Body must be a JSON object.");
  }
  const body: Record<string, unknown> = { ...raw };

  if (!body.statusId) {
    const status = await prisma.status.findFirst({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { order: "asc" },
      select: { id: true },
    });
    if (!status) throw new ApiError("internal", "Workspace has no project statuses.");
    body.statusId = status.id;
  }

  const input = createProjectSchema.parse(body);
  await assertProjectRefsInWorkspace(ctx.workspaceId, input);

  try {
    const project = await createProject(ctx.workspaceId, input);
    await notifyWorkspace(ctx.workspaceId, "projects");
    const full = await prisma.project.findUniqueOrThrow({
      where: { id: project.id },
      include: {
        status: true,
        projectLead: { select: { id: true, name: true, email: true } },
        _count: { select: { tasks: true } },
      },
    });
    return NextResponse.json({ project: serializeProject(full) }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ApiError("invalid_request", `Project code "${input.code}" is already in use.`);
    }
    throw err;
  }
});
