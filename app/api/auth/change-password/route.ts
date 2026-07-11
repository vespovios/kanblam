import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/permissions";
import { changePasswordSchema } from "@/lib/validators/auth";

/** POST /api/auth/change-password
 *  Authenticated user changes their own password.
 *
 *  Flow: validate body → load user from DB (need the hash, not just session)
 *  → bcrypt.compare current password → bcrypt.hash new → update.
 *
 *  Notes:
 *  - Session invalidation across other devices is deliberately out of scope
 *    for beta. The Auth.js v5 JWT strategy doesn't expose a clean revoke
 *    primitive without rotating the global secret. Phase 1 hardening.
 *  - The CF rate-limit rule we set up on /api/auth/* applies here too
 *    (10 req / 10s / IP), so brute-forcing current-password is bounded.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, passwordHash: true },
  });
  if (!dbUser?.passwordHash) {
    // User without a passwordHash (OAuth-only path, not used today but
    // possible if we add SSO). They have no current password to verify
    // against, so they can't use this endpoint — they'd need a separate
    // SSO-reauth flow.
    return NextResponse.json(
      { error: "This account has no password set" },
      { status: 400 },
    );
  }

  const currentOk = await bcrypt.compare(
    parsed.data.currentPassword,
    dbUser.passwordHash,
  );
  if (!currentOk) {
    // Surface the failure on the currentPassword field. Same wording the
    // form will display inline. Status 400 (not 401) — the request is
    // authenticated, the *input* is wrong.
    return NextResponse.json(
      { error: "Current password is incorrect", field: "currentPassword" },
      { status: 400 },
    );
  }

  const newHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.user.update({
    where: { id: dbUser.id },
    data: { passwordHash: newHash },
  });

  return NextResponse.json({ ok: true });
}
