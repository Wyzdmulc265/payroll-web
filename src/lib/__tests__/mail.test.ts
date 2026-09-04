import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  sendPasswordResetEmail,
  isSmtpConfigured,
  __resetTransporterCache,
  redactSmtpError,
} from '@/lib/mail';

const { sendMail, createTransport } = vi.hoisted(() => ({
  sendMail: vi.fn(),
  createTransport: vi.fn(() => ({ sendMail })),
}));

vi.mock('nodemailer', () => ({
  default: { createTransport },
}));

function setBrevoEnv(): void {
  vi.stubEnv('SMTP_HOST', 'smtp-relay.brevo.com');
  vi.stubEnv('SMTP_PORT', '587');
  vi.stubEnv('SMTP_USER', 'brevo-test-login');
  vi.stubEnv('SMTP_PASS', 'brevo-test-key');
  vi.stubEnv('SMTP_FROM', 'Payroll System <sender@brevo-test.com>');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://payroll.example.com');
}

function clearSmtpEnv(): void {
  vi.stubEnv('SMTP_HOST', '');
  vi.stubEnv('SMTP_PORT', '');
  vi.stubEnv('SMTP_USER', '');
  vi.stubEnv('SMTP_PASS', '');
  vi.stubEnv('SMTP_FROM', '');
}

describe('mail module', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sendMail.mockReset();
    createTransport.mockClear();
    __resetTransporterCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    __resetTransporterCache();
  });

  describe('isSmtpConfigured', () => {
    it('reports all five vars as missing when unset', () => {
      clearSmtpEnv();
      const { configured, missing } = isSmtpConfigured();
      expect(configured).toBe(false);
      expect(missing).toEqual(['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM']);
    });

    it('reports configured once every var is set', () => {
      setBrevoEnv();
      const { configured, missing } = isSmtpConfigured();
      expect(configured).toBe(true);
      expect(missing).toEqual([]);
    });
  });

  describe('sendPasswordResetEmail — successful Brevo delivery', () => {
    it('creates a STARTTLS transporter and sends a branded reset email', async () => {
      setBrevoEnv();
      vi.stubEnv('NODE_ENV', 'test');
      sendMail.mockResolvedValueOnce({ messageId: 'msg-123' });

      await sendPasswordResetEmail('user@example.com', 'tok123');

      expect(createTransport).toHaveBeenCalledTimes(1);
      expect(createTransport).toHaveBeenCalledWith({
        host: 'smtp-relay.brevo.com',
        port: 587,
        secure: false,
        requireTLS: true,
        auth: { user: 'brevo-test-login', pass: 'brevo-test-key' },
      });

      expect(sendMail).toHaveBeenCalledTimes(1);
      const args = sendMail.mock.calls[0][0];
      const resetUrl = 'https://payroll.example.com/reset-password/tok123';

      expect(args.from).toBe('Payroll System <sender@brevo-test.com>');
      expect(args.to).toBe('user@example.com');
      expect(args.subject).toBe('Reset your Payroll System password');
      expect(args.html).toContain('Reset your Payroll System password');
      expect(args.html).toContain(resetUrl);
      expect(args.html).toContain('expires in 1 hour');
      expect(args.html).toContain('did not request a password reset');
      expect(args.html).toContain('Reset my password');
      expect(args.text).toContain(resetUrl);
      expect(args.text).toContain('did not request a password reset');
    });
  });

  describe('sendPasswordResetEmail — missing SMTP config (development)', () => {
    it('logs a security-safe message to the console and does not call sendMail', async () => {
      clearSmtpEnv();
      vi.stubEnv('NODE_ENV', 'test');
      vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://payroll.example.com');
      const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

      await sendPasswordResetEmail('user@example.com', 'devtok');

      expect(createTransport).not.toHaveBeenCalled();
      expect(sendMail).not.toHaveBeenCalled();
      expect(spy).toHaveBeenCalledTimes(1);
      // Token is intentionally omitted from logs for security
      expect(spy.mock.calls[0][0]).toContain('user@example.com');
      expect(spy.mock.calls[0][0]).not.toContain('devtok');
    });
  });

  describe('sendPasswordResetEmail — missing SMTP config (production)', () => {
    it('throws instead of silently logging the link', async () => {
      clearSmtpEnv();
      vi.stubEnv('NODE_ENV', 'production');
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      await expect(sendPasswordResetEmail('user@example.com', 'prodtok')).rejects.toThrow(
        /SMTP configuration is incomplete/,
      );

      expect(createTransport).not.toHaveBeenCalled();
      expect(sendMail).not.toHaveBeenCalled();
      expect(infoSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });

  describe('sendPasswordResetEmail — SMTP failure is rethrown without leaking secrets', () => {
    it('rethrows a connection/auth error and never leaks SMTP_PASS', async () => {
      setBrevoEnv();
      vi.stubEnv('NODE_ENV', 'production');
      const failure = new Error('connect ECONNREFUSED 52.28.0.123:587');
      sendMail.mockRejectedValueOnce(failure);

      let thrown: unknown;
      try {
        await sendPasswordResetEmail('user@example.com', 'badtok');
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).toContain('connect ECONNREFUSED');
      expect(String(thrown)).not.toContain('brevo-test-key');
    });
  });

  describe('redactSmtpError', () => {
    it('removes the SMTP password from error text', () => {
      setBrevoEnv();
      const err = new Error(`sendCommand failed for ${process.env.SMTP_PASS}`);
      const safe = redactSmtpError(err);
      expect(safe).not.toContain('brevo-test-key');
      expect(safe).toContain('[REDACTED]');
    });

    it('includes the error code when present', () => {
      const err = { code: 'EAUTH', message: 'Invalid credentials' };
      expect(redactSmtpError(err)).toBe('[EAUTH] Invalid credentials');
    });
  });
});
