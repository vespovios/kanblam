import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { assertWorkspaceWritable, WorkspaceAuthError } from "@/lib/auth/workspace-scope";
import { notifyWorkspace } from "@/lib/realtime/notify";

type Ctx = { params: Promise<{ id: string }> };

/** DELETE /api/invite/[id]
 *  Admin-only cancellation of a pending invite. Workspace-scoped so admins
 *  can only revoke invites within their own workspace. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await assertWorkspaceWritable(session.user.workspaceId);
  } catch (err) {
    if (err instanceof WorkspaceAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const { id } = await params;

  // deleteMany with workspace scope as the safety belt — if the id is
  // valid but the invite belongs to a different workspace, count is 0
  // and we return 404 rather than leaking that another workspace's
  // invite exists.
  const res = await prisma.invite.deleteMany({
    where: { id, workspaceId: session.user.workspaceId },
  });
  if (res.count === 0) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }

  await notifyWorkspace(session.user.workspaceId, "members");
  return NextResponse.json({ ok: true });
}
