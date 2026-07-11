import { NextResponse } from "next/server";
import { requireWorkspaceContext, WorkspaceAuthError } from "@/lib/auth/workspace-scope";
import { revokeApiToken } from "@/lib/api-tokens/service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** DELETE /api/settings/api-tokens/[id] — revoke (tombstone) one of the
 *  caller's own tokens. 404 for unknown ids AND other users' tokens —
 *  indistinguishable on purpose. */
export async function DELETE(_req: Request, { params }: RouteContext) {
  try {
    const ctx = await requireWorkspaceContext();
    const { id } = await params;
    const revoked = await revokeApiToken(ctx.userId, id);
    if (!revoked) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof WorkspaceAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
