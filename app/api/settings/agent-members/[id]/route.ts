import { NextResponse } from "next/server";
import { requireWritableWorkspace, WorkspaceAuthError } from "@/lib/auth/workspace-scope";
import { renameAgentMemberSchema } from "@/lib/validators/agent-member";
import { renameAgentMember, removeAgentMember } from "@/lib/agent-members/service";
import { notifyWorkspace } from "@/lib/realtime/notify";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  try {
    const ctx = await requireWritableWorkspace({ admin: true });
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const parsed = renameAgentMemberSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const ok = await renameAgentMember(ctx.workspaceId, id, parsed.data);
    if (!ok) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    await notifyWorkspace(ctx.workspaceId, "members");
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof WorkspaceAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const ctx = await requireWritableWorkspace({ admin: true });
    const { id } = await params;
    const ok = await removeAgentMember(ctx.workspaceId, id);
    if (!ok) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    await notifyWorkspace(ctx.workspaceId, "members");
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof WorkspaceAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
