import { NextResponse } from "next/server";
import { requireWritableWorkspace, WorkspaceAuthError } from "@/lib/auth/workspace-scope";
import { createApiTokenSchema } from "@/lib/validators/api-token";
import { createApiToken } from "@/lib/api-tokens/service";
import { agentInWorkspace, callerIsCurrentAdmin } from "@/lib/agent-members/route-helpers";

type Params = { params: Promise<{ id: string }> };

/** Settings → Agent members → mint a token on behalf of an agent. Admin-only. */
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireWritableWorkspace({ admin: true });
    // Fresh-role check: JWTs cache role for up to 30 days — minting long-lived credentials requires current ADMIN, not cached.
    if (!(await callerIsCurrentAdmin(ctx.userId, ctx.workspaceId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    if (!(await agentInWorkspace(ctx.workspaceId, id))) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }
    const body = await req.json().catch(() => null);
    const parsed = createApiTokenSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    try {
      const { token, record } = await createApiToken(id, parsed.data);
      return NextResponse.json({ token, record }, { status: 201 });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create token";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof WorkspaceAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
