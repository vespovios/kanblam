import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { assertWorkspaceWritable, WorkspaceAuthError } from "@/lib/auth/workspace-scope";
import { createInviteSchema } from "@/lib/validators/invite";
import { createInvite } from "@/lib/invites/create";

export async function POST(req: Request) {
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

  const body = await req.json().catch(() => null);
  const parsed = createInviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    await createInvite({
      workspaceId: session.user.workspaceId,
      invitedById: session.user.id,
      email: parsed.data.email,
      appUrl: process.env.APP_URL ?? "http://localhost:3000",
      sendEmail: true,
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create invite";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
