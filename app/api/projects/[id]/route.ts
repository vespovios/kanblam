import { NextResponse } from "next/server";
import { requireWorkspaceContext, assertWorkspaceWritable, WorkspaceAuthError } from "@/lib/auth/workspace-scope";
import { updateProjectSchema } from "@/lib/validators/project";
import { getProject, updateProject, deleteProject } from "@/lib/projects/service";
import { notifyWorkspace } from "@/lib/realtime/notify";

type RouteContext = { params: Promise<{ id: string }> };

async function withCtx<T>(handler: (ctx: { workspaceId: string }) => Promise<T>): Promise<T | NextResponse> {
  try {
    const ctx = await requireWorkspaceContext();
    return await handler({ workspaceId: ctx.workspaceId });
  } catch (err) {
    if (err instanceof WorkspaceAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function GET(_req: Request, { params }: RouteContext) {
  const { id } = await params;
  return withCtx(async (ctx) => {
    const project = await getProject(ctx.workspaceId, id);
    if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ project });
  });
}

export async function PATCH(req: Request, { params }: RouteContext) {
  const { id } = await params;
  return withCtx(async (ctx) => {
    await assertWorkspaceWritable(ctx.workspaceId);
    const body = await req.json().catch(() => null);
    const parsed = updateProjectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const project = await updateProject(ctx.workspaceId, id, parsed.data);
    if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await notifyWorkspace(ctx.workspaceId, "projects");
    return NextResponse.json({ project });
  });
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  const { id } = await params;
  return withCtx(async (ctx) => {
    await assertWorkspaceWritable(ctx.workspaceId);
    const ok = await deleteProject(ctx.workspaceId, id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await notifyWorkspace(ctx.workspaceId, "projects");
    return NextResponse.json({ ok: true });
  });
}
