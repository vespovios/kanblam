import { NextResponse } from "next/server";
import { requireWritableWorkspace, WorkspaceAuthError } from "@/lib/auth/workspace-scope";
import { createAgentMemberSchema } from "@/lib/validators/agent-member";
import { createAgentMember } from "@/lib/agent-members/service";
import { notifyWorkspace } from "@/lib/realtime/notify";

/** Settings → Agent members. Admin-only create; the settings page itself
 *  reads via a server component, so there's no GET here. */

export async function POST(req: Request) {
  try {
    const ctx = await requireWritableWorkspace({ admin: true });
    const body = await req.json().catch(() => null);
    const parsed = createAgentMemberSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    try {
      const agent = await createAgentMember(ctx.workspaceId, parsed.data);
      await notifyWorkspace(ctx.workspaceId, "members");
      return NextResponse.json({ agent }, { status: 201 });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create agent";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof WorkspaceAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
