import { NextResponse } from "next/server";
import { requireWritableWorkspace, WorkspaceAuthError } from "@/lib/auth/workspace-scope";
import { revokeApiToken } from "@/lib/api-tokens/service";
import { agentInWorkspace, callerIsCurrentAdmin } from "@/lib/agent-members/route-helpers";

type Params = { params: Promise<{ id: string; tokenId: string }> };

/** Settings → Agent members → revoke a token minted on behalf of an agent.
 *  Admin-only. No notify call — tokens aren't a realtime "members" concern;
 *  the settings page refreshes client-side. */
export async function DELETE(_req: Request, { params }: Params) {
  try {
    const ctx = await requireWritableWorkspace({ admin: true });
    // Fresh-role check: JWTs cache role for up to 30 days — minting long-lived credentials requires current ADMIN, not cached.
    if (!(await callerIsCurrentAdmin(ctx.userId, ctx.workspaceId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id, tokenId } = await params;
    if (!(await agentInWorkspace(ctx.workspaceId, id))) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }
    const ok = await revokeApiToken(id, tokenId);
    if (!ok) return NextResponse.json({ error: "Token not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof WorkspaceAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
