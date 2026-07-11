import { NextResponse } from "next/server";
import { requireWritableWorkspace, WorkspaceAuthError } from "@/lib/auth/workspace-scope";
import { moveTaskSchema } from "@/lib/validators/task-move";
import { moveTask } from "@/lib/tasks/service";
import { notifyWorkspace } from "@/lib/realtime/notify";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    const ctx = await requireWritableWorkspace();
    const body = await req.json().catch(() => null);
    const parsed = moveTaskSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const task = await moveTask(ctx.workspaceId, id, parsed.data);
    if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await notifyWorkspace(ctx.workspaceId, "tasks");
    return NextResponse.json({ task });
  } catch (err) {
    if (err instanceof WorkspaceAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
