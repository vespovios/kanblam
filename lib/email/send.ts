import nodemailer from "nodemailer";

function makeTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 1025),
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}

interface SendMailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export async function sendMail({ to, subject, text, html }: SendMailInput): Promise<void> {
  const transport = makeTransport();
  await transport.sendMail({
    from: process.env.SMTP_FROM ?? "KanBlam <noreply@kanblam.local>",
    to,
    subject,
    text,
    html,
  });
}
