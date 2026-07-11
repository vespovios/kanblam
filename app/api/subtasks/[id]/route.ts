import { NextResponse } from "next/server";
import { requireWritableWorkspace, WorkspaceAuthError } from "@/lib/auth/workspace-scope";
import { updateSubtaskSchema } from "@/lib/validators/subtask";
import { updateSubtask, deleteSubtask } from "@/lib/subtasks/service";
import { notifyWorkspace } from "@/lib/realtime/notify";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: RouteContext) {
  try {
    const ctx = await requireWritableWorkspace();
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const parsed = updateSubtaskSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const subtask = await updateSubtask(ctx.workspaceId, id, parsed.data);
    if (subtask === null) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await notifyWorkspace(ctx.workspaceId, "tasks");
    return NextResponse.json({ subtask });
  } catch (err) {
    if (err instanceof WorkspaceAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  try {
    const ctx = await requireWritableWorkspace();
    const { id } = await params;
    const ok = await deleteSubtask(ctx.workspaceId, id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await notifyWorkspace(ctx.workspaceId, "tasks");
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof WorkspaceAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
