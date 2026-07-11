import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { apiHandler } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { serializeProject } from "@/lib/api/serialize";
import { updateProjectSchema } from "@/lib/validators/project";
import { getProject, updateProject, deleteProject } from "@/lib/projects/service";
import { notifyWorkspace } from "@/lib/realtime/notify";
import { assertProjectRefsInWorkspace } from "@/lib/api/project-refs";

/** GET /api/v1/projects/[id] */
export const GET = apiHandler("read", async (_req, ctx, extra) => {
  const { id } = await extra.params;
  const project = await getProject(ctx.workspaceId, id);
  if (!project) throw new ApiError("not_found", "Project not found.");
  return NextResponse.json({ project: serializeProject(project) });
});

/** PATCH /api/v1/projects/[id] */
export const PATCH = apiHandler("write", async (req, ctx, extra) => {
  const { id } = await extra.params;
  const body = await req.json().catch(() => null);
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError("invalid_request", "Body must be a JSON object.");
  }
  const input = updateProjectSchema.parse(body);
  await assertProjectRefsInWorkspace(ctx.workspaceId, input);

  try {
    const updated = await updateProject(ctx.workspaceId, id, input);
    if (!updated) throw new ApiError("not_found", "Project not found.");
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ApiError("invalid_request", `Project code "${input.code}" is already in use.`);
    }
    throw err;
  }
  await notifyWorkspace(ctx.workspaceId, "projects");
  const full = await getProject(ctx.workspaceId, id);
  return NextResponse.json({ project: full ? serializeProject(full) : null });
});

/** DELETE /api/v1/projects/[id] — deletes the project AND all its tasks
 *  (cascade). Deliberately the same semantics as the app. */
export const DELETE = apiHandler("write", async (_req, ctx, extra) => {
  const { id } = await extra.params;
  const deleted = await deleteProject(ctx.workspaceId, id);
  if (!deleted) throw new ApiError("not_found", "Project not found.");
  await notifyWorkspace(ctx.workspaceId, "projects");
  await notifyWorkspace(ctx.workspaceId, "tasks");
  return NextResponse.json({ ok: true });
});
