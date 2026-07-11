import { NextResponse } from "next/server";
import { requireWritableWorkspace, WorkspaceAuthError } from "@/lib/auth/workspace-scope";
import { reorderSubtasksSchema } from "@/lib/validators/subtask";
import { reorderSubtasks } from "@/lib/subtasks/service";
import { notifyWorkspace } from "@/lib/realtime/notify";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: RouteContext) {
  try {
    const ctx = await requireWritableWorkspace();
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const parsed = reorderSubtasksSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    try {
      const ok = await reorderSubtasks(ctx.workspaceId, id, parsed.data.orderedIds);
      if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
      await notifyWorkspace(ctx.workspaceId, "tasks");
      return NextResponse.json({ ok: true });
    } catch (err) {
      if (err instanceof Error && /set mismatch/i.test(err.message)) {
        return NextResponse.json({ error: err.message }, { status: 400 });
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
