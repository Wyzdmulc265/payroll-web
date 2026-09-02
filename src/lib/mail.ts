import nodemailer from 'nodemailer';

export type MailTransporter = nodemailer.Transporter<nodemailer.SendMailOptions> | undefined;

let cachedTransporter: MailTransporter;

function getTransporter(): MailTransporter {
  if (cachedTransporter) return cachedTransporter;
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && port && user && pass) {
    cachedTransporter = nodemailer.createTransport({ host, port, auth: { user, pass } });
  } else {
    cachedTransporter = undefined;
  }
  return cachedTransporter;
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const resetUrl = `${appUrl}/reset-password/${token}`;
  const from = process.env.SMTP_FROM ?? 'no-reply@example.com';

  const html = `<p>Click the link below to reset your password. This link expires in one hour.</p>
<p><a href="${resetUrl}">${resetUrl}</a></p>`;

  const transporter = getTransporter();
  if (!transporter) {
    console.info(`Password reset email for ${to}: ${resetUrl}`);
    return;
  }

  await transporter.sendMail({
    from,
    to,
    subject: 'Password reset',
    text: resetUrl,
    html,
  });
}
