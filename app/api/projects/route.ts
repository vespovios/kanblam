import { NextResponse } from "next/server";
import { requireWorkspaceContext, requireWritableWorkspace, WorkspaceAuthError } from "@/lib/auth/workspace-scope";
import { createProjectSchema } from "@/lib/validators/project";
import { createProject, listProjects } from "@/lib/projects/service";
import { notifyWorkspace } from "@/lib/realtime/notify";

export async function GET() {
  try {
    const ctx = await requireWorkspaceContext();
    const projects = await listProjects(ctx.workspaceId);
    return NextResponse.json({ projects });
  } catch (err) {
    if (err instanceof WorkspaceAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireWritableWorkspace();
    const body = await req.json().catch(() => null);
    const parsed = createProjectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    try {
      const project = await createProject(ctx.workspaceId, parsed.data);
      await notifyWorkspace(ctx.workspaceId, "projects");
      return NextResponse.json({ project }, { status: 201 });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create project";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof WorkspaceAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
