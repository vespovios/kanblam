import { prisma } from "@/lib/db";
import { generateToken, hashToken } from "@/lib/invites/token";
import { sendMail } from "@/lib/email/send";
import { inviteEmail } from "@/lib/email/templates";

const INVITE_TTL_DAYS = 7;

interface CreateInviteInput {
  workspaceId: string;
  invitedById: string;
  email: string;
  appUrl: string;
  sendEmail?: boolean; // allow tests to skip SMTP
}

export async function createInvite({
  workspaceId,
  invitedById,
  email,
  appUrl,
  sendEmail: shouldSendEmail = false,
}: CreateInviteInput) {
  const normalized = email.toLowerCase().trim();

  const existingUser = await prisma.user.findFirst({
    where: { workspaceId, email: normalized },
  });
  if (existingUser) {
    throw new Error(`User with email ${normalized} already exists in this workspace.`);
  }

  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

  const invite = await prisma.invite.create({
    data: { workspaceId, email: normalized, tokenHash, invitedById, expiresAt },
    include: { workspace: true, invitedBy: true },
  });

  if (shouldSendEmail) {
    const { subject, text, html } = inviteEmail({
      workspaceName: invite.workspace.name,
      signupUrl: `${appUrl}/signup?token=${rawToken}`,
      invitedBy: invite.invitedBy.name ?? invite.invitedBy.email,
    });
    await sendMail({ to: normalized, subject, text, html });
  }

  return { rawToken, invite };
}
