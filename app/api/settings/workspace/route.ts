import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireWritableWorkspace, WorkspaceAuthError } from "@/lib/auth/workspace-scope";
import { updateWorkspaceNameSchema } from "@/lib/validators/workspace-settings";
import { notifyWorkspace } from "@/lib/realtime/notify";

/** PATCH /api/settings/workspace
 *  Admin-only rename of the current workspace. The name surfaces in the
 *  topbar pill on every page, so we emit a "workspace" realtime event after
 *  the update — open tabs in other browsers / sessions will see the new
 *  name on their next idle cycle. */
export async function PATCH(req: Request) {
  try {
    const ctx = await requireWritableWorkspace({ admin: true });
    const body = await req.json().catch(() => null);
    const parsed = updateWorkspaceNameSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    await prisma.workspace.update({
      where: { id: ctx.workspaceId },
      data: { name: parsed.data.name },
    });
    await notifyWorkspace(ctx.workspaceId, "workspace");
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof WorkspaceAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
