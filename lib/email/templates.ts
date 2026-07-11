interface InviteEmailInput {
  workspaceName: string;
  signupUrl: string;
  invitedBy: string;
}

export function inviteEmail({ workspaceName, signupUrl, invitedBy }: InviteEmailInput) {
  const subject = `You've been invited to ${workspaceName} on KanBlam`;

  const text = [
    `Hi,`,
    ``,
    `${invitedBy} has invited you to join the "${workspaceName}" workspace on KanBlam.`,
    ``,
    `Accept your invite by opening this link:`,
    signupUrl,
    ``,
    `This link expires in 7 days.`,
    ``,
    `— KanBlam`,
  ].join("\n");

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, sans-serif; background:#fdf7f5; padding:24px; color:#5a3b34;">
  <div style="max-width:520px; margin:0 auto; background:#fff; border-radius:12px; padding:32px; border:1px solid #eadad5;">
    <h1 style="margin:0 0 12px; font-size:20px;">You're invited to KanBlam</h1>
    <p>Hi,</p>
    <p><strong>${invitedBy}</strong> has invited you to join the <strong>${workspaceName}</strong> workspace on KanBlam.</p>
    <p style="margin-top:24px">
      <a href="${signupUrl}" style="background:#d4a5a0; color:#fff; padding:10px 20px; border-radius:6px; text-decoration:none; display:inline-block;">Accept invite</a>
    </p>
    <p style="font-size:12px; color:#8a726b; margin-top:24px">This link expires in 7 days. If the button doesn't work, paste this URL into your browser:<br>${signupUrl}</p>
  </div>
</body>
</html>
  `.trim();

  return { subject, text, html };
}
