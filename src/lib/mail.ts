import nodemailer from 'nodemailer';

const REQUIRED_SMTP_VARS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'] as const;

export function isSmtpConfigured(): { configured: boolean; missing: string[] } {
  const missing = REQUIRED_SMTP_VARS.filter((v) => !process.env[v]);
  return { configured: missing.length === 0, missing };
}

export type MailTransporter = nodemailer.Transporter<nodemailer.SendMailOptions> | undefined;

let cachedTransporter: MailTransporter | null = null;

export function __resetTransporterCache(): void {
  cachedTransporter = null;
}

function getTransporter(): MailTransporter {
  if (cachedTransporter !== null) return cachedTransporter;
  const { configured } = isSmtpConfigured();
  if (!configured) {
    cachedTransporter = undefined;
    return undefined;
  }
  const port = Number(process.env.SMTP_PORT);
  cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: false,
    requireTLS: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return cachedTransporter;
}

export function redactSmtpError(err: unknown): string {
  if (!err) return 'unknown error';
  const e = err as { code?: unknown; message?: unknown };
  const code = typeof e.code === 'string' ? e.code : '';
  let message: string;
  if (err instanceof Error) {
    message = err.message;
  } else if (typeof e.message === 'string') {
    message = e.message;
  } else if (typeof err === 'string') {
    message = err;
  } else {
    message = JSON.stringify(err);
  }
  const pass = process.env.SMTP_PASS;
  if (pass) message = message.split(pass).join('[REDACTED]');
  return code ? `[${code}] ${message}` : message;
}

const APP_NAME = 'Payroll System';
const TOKEN_TTL_LABEL = '1 hour';

function renderResetHtml(params: { appName: string; resetUrl: string; expiry: string }): string {
  const { appName, resetUrl, expiry } = params;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Reset your ${appName} password</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:32px auto;background:#ffffff;border-radius:8px;">
  <tr>
    <td style="padding:32px;">
      <h1 style="margin:0 0 16px 0;font-size:20px;">Reset your ${appName} password</h1>
      <p style="margin:0 0 16px 0;font-size:14px;line-height:20px;">You requested a password reset for ${appName}. This link expires in ${expiry}.</p>
      <p style="margin:0 0 24px 0;text-align:center;">
        <a href="${resetUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">Reset my password</a>
      </p>
      <p style="margin:0 0 16px 0;font-size:13px;line-height:18px;color:#4b5563;">If the button above does not work, copy and paste this URL into your browser:</p>
      <p style="margin:0 0 16px 0;font-size:12px;line-height:18px;word-break:break-all;color:#6b7280;">${resetUrl}</p>
      <p style="margin:0;font-size:12px;line-height:18px;color:#6b7280;">If you did not request a password reset, you can safely ignore this email. Your password will not change unless you click the link above.</p>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function renderResetText(params: { appName: string; resetUrl: string; expiry: string }): string {
  const { appName, resetUrl, expiry } = params;
  return `${appName} password reset

You requested a password reset for ${appName}. This link expires in ${expiry}.

Reset link:
${resetUrl}

If you did not request a password reset, you can safely ignore this email. Your password will not change unless you visit the link above.`;
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const resetUrl = `${appUrl}/reset-password/${token}`;

  const { configured, missing } = isSmtpConfigured();

  if (!configured) {
    if (process.env.NODE_ENV !== 'production') {
      console.info(`[mail] SMTP not configured — password reset link for ${to}: ${resetUrl}`);
      return;
    }
    throw new Error(
      'SMTP configuration is incomplete; cannot send email. ' +
      `Missing: ${missing.join(', ')}`,
    );
  }

  const from = process.env.SMTP_FROM!;

  const transporter = getTransporter();
  const html = renderResetHtml({ appName: APP_NAME, resetUrl, expiry: TOKEN_TTL_LABEL });
  const text = renderResetText({ appName: APP_NAME, resetUrl, expiry: TOKEN_TTL_LABEL });

  await transporter!.sendMail({
    from,
    to,
    subject: `Reset your ${APP_NAME} password`,
    text,
    html,
  });
}
