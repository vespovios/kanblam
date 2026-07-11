import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/invites/token";
import { signupSchema } from "@/lib/validators/auth";
import { notifyWorkspace } from "@/lib/realtime/notify";
import { assertWorkspaceWritable, WorkspaceAuthError } from "@/lib/auth/workspace-scope";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { token, name, password } = parsed.data;
  const tokenHash = hashToken(token);
  const invite = await prisma.invite.findUnique({ where: { tokenHash } });
  if (!invite) return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  if (invite.acceptedAt) return NextResponse.json({ error: "Invite already used" }, { status: 410 });
  if (invite.expiresAt < new Date()) return NextResponse.json({ error: "Invite expired" }, { status: 410 });

  try {
    await assertWorkspaceWritable(invite.workspaceId);
  } catch (err) {
    if (err instanceof WorkspaceAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.$transaction([
    prisma.user.create({
      data: {
        workspaceId: invite.workspaceId,
        email: invite.email,
        name,
        passwordHash,
        role: "MEMBER",
      },
    }),
    prisma.invite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    }),
  ]);

  await notifyWorkspace(invite.workspaceId, "members");
  return NextResponse.json({ ok: true }, { status: 201 });
}
