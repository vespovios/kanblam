import { NextResponse } from "next/server";
import { requireWritableWorkspace, WorkspaceAuthError } from "@/lib/auth/workspace-scope";
import { updateTagSchema } from "@/lib/validators/tag";
import { updateTag, deleteTag } from "@/lib/tags/service";
import { notifyWorkspace } from "@/lib/realtime/notify";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: RouteContext) {
  try {
    const ctx = await requireWritableWorkspace();
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const parsed = updateTagSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    try {
      const tag = await updateTag(ctx.workspaceId, id, parsed.data);
      if (!tag) return NextResponse.json({ error: "Not found" }, { status: 404 });
      await notifyWorkspace(ctx.workspaceId, "tags");
      return NextResponse.json({ tag });
    } catch (err) {
      if (err instanceof Error && /already exists/i.test(err.message)) {
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

export async function DELETE(_req: Request, { params }: RouteContext) {
  try {
    const ctx = await requireWritableWorkspace();
    const { id } = await params;
    const ok = await deleteTag(ctx.workspaceId, id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await notifyWorkspace(ctx.workspaceId, "tags");
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof WorkspaceAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
