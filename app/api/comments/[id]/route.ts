import { NextResponse } from "next/server";
import { requireWritableWorkspace, WorkspaceAuthError } from "@/lib/auth/workspace-scope";
import { deleteComment } from "@/lib/comments/service";
import { notifyWorkspace } from "@/lib/realtime/notify";

interface Ctx {
  params: Promise<{ id: string }>;
}

/** DELETE /api/comments/[id] — own comments; admins may moderate any. */
export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const ctx = await requireWritableWorkspace();
    const { id } = await params;
    const deleted = await deleteComment(ctx.workspaceId, id, {
      userId: ctx.userId,
      role: ctx.role,
    });
    if (!deleted) return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    await notifyWorkspace(ctx.workspaceId, "tasks");
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof WorkspaceAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
