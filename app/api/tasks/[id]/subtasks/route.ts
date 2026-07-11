import { NextResponse } from "next/server";
import { requireWorkspaceContext, requireWritableWorkspace, WorkspaceAuthError } from "@/lib/auth/workspace-scope";
import { createSubtaskSchema } from "@/lib/validators/subtask";
import { listSubtasks, createSubtask } from "@/lib/subtasks/service";
import { notifyWorkspace } from "@/lib/realtime/notify";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteContext) {
  try {
    const ctx = await requireWorkspaceContext();
    const { id } = await params;
    const subtasks = await listSubtasks(ctx.workspaceId, id);
    if (subtasks === null) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ subtasks });
  } catch (err) {
    if (err instanceof WorkspaceAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function POST(req: Request, { params }: RouteContext) {
  try {
    const ctx = await requireWritableWorkspace();
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const parsed = createSubtaskSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    try {
      const subtask = await createSubtask(ctx.workspaceId, id, parsed.data);
      if (subtask === null) return NextResponse.json({ error: "Not found" }, { status: 404 });
      await notifyWorkspace(ctx.workspaceId, "tasks");
      return NextResponse.json({ subtask }, { status: 201 });
    } catch (err) {
      if (err instanceof Error && /Maximum \d+ subtasks/i.test(err.message)) {
        return NextResponse.json({ error: err.message }, { status: 409 });
      }
      throw err;
    }
  } catch (err) {
    if (err instanceof WorkspaceAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
