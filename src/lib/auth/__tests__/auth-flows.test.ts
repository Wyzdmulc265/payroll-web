import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as postLogin } from '@/app/api/auth/login/route';
import { POST as postLogout } from '@/app/api/auth/logout/route';
import { POST as postForgot } from '@/app/api/auth/forgot-password/route';
import { POST as postReset } from '@/app/api/auth/reset-password/route';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import { SESSION_COOKIE } from '@/lib/auth';
import { __resetTransporterCache } from '@/lib/mail';

const { sendMail } = vi.hoisted(() => ({ sendMail: vi.fn() }));
vi.mock('nodemailer', () => ({
  default: { createTransport: vi.fn(() => ({ sendMail })) },
}));

const SMTP_VARS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'] as const;
function clearSmtpEnv(): void {
  for (const v of SMTP_VARS) delete process.env[v];
}
function setBrevoEnv(): void {
  clearSmtpEnv();
  process.env.SMTP_HOST = 'smtp-relay.brevo.com';
  process.env.SMTP_PORT = '587';
  process.env.SMTP_USER = 'brevo-test-login';
  process.env.SMTP_PASS = 'brevo-test-key';
  process.env.SMTP_FROM = 'Payroll System <sender@brevo-test.com>';
  process.env.NEXT_PUBLIC_APP_URL = 'https://payroll.example.com';
}

function makeRequest(url: string, init: { body?: unknown; cookie?: string; ua?: string } = {}): NextRequest {
  const headers = new Headers();
  headers.set('x-forwarded-for', '203.0.113.7');
  headers.set('user-agent', init.ua ?? 'vitest-agent');
  if (init.cookie) headers.set('cookie', init.cookie);
  return new NextRequest(url, {
    method: 'POST',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}`;
}

async function latestAudit(action: string) {
  return prisma.auditLog.findFirst({ where: { action }, orderBy: { timestamp: 'desc' } });
}

describe('auth route flows', () => {
  let email: string;
  let password: string;

  beforeEach(async () => {
    password = 'FlowTest123';
    email = `flow-${Date.now()}@test.com`;
    await prisma.auditLog.deleteMany({ where: { action: { in: ['LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'FORGOT_PASSWORD_REQUESTED', 'PASSWORD_CHANGED'] }, description: { contains: 'flow test marker' } } }).catch(() => {});
    const hash = await bcrypt.hash(password, 10);
    const biz = await prisma.business.create({ data: { name: `Flow Biz ${Date.now()}` } });
    await prisma.user.create({
      data: { email, passwordHash: hash, role: 'ADMIN', status: 'ACTIVE', businessId: biz.id },
    });
  }, 30000);

  afterEach(async () => {
    clearSmtpEnv();
    __resetTransporterCache();
    await prisma.rateLimit.deleteMany().catch(() => {});
  });

  it('rejects a bad password with 401 and writes LOGIN_FAILED', async () => {
    const res = await postLogin(makeRequest('http://localhost/api/auth/login', { body: { email, password: 'WrongPass1' } }));
    expect(res.status).toBe(401);
    const evt = await latestAudit('LOGIN_FAILED');
    expect(evt).not.toBeNull();
    expect(evt?.ipAddress).toBe('203.0.113.7');
  }, 30000);

  it('rejects a malformed payload with 400', async () => {
    const res = await postLogin(makeRequest('http://localhost/api/auth/login', { body: { email: 'not-an-email', password: 'x' } }));
    expect(res.status).toBe(400);
  }, 30000);

  it('logs in successfully, sets the cookie, writes LOGIN_SUCCESS, and the session validates', async () => {
    const res = await postLogin(makeRequest('http://localhost/api/auth/login', { body: { email, password } }));
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('HttpOnly');
    const token = setCookie.split(';')[0].split('=')[1];
    const evt = await latestAudit('LOGIN_SUCCESS');
    expect(evt?.userId).not.toBeNull();
    const sessions = await prisma.session.findMany({ where: { tokenHash: createHash('sha256').update(token).digest('hex') } });
    expect(sessions).toHaveLength(1);
  }, 30000);

  it('returns 429 after six attempts from the same key and includes Retry-After', async () => {
    const ua = `rate-${Date.now()}`;
    let last = 0;
    for (let i = 0; i < 6; i += 1) {
      const res = await postLogin(makeRequest('http://localhost/api/auth/login', { body: { email, password: 'WrongPass1' }, ua }));
      last = res.status;
    }
    expect(last).toBe(429);
    const blocked = await postLogin(makeRequest('http://localhost/api/auth/login', { body: { email, password: 'WrongPass1' }, ua }));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).not.toBeNull();
    const json = await blocked.json();
    expect(json.retryAfterSeconds).toBeGreaterThan(0);
  }, 60000);

  it('logout invalidates the session so it no longer validates', async () => {
    const loginRes = await postLogin(makeRequest('http://localhost/api/auth/login', { body: { email, password } }));
    const token = (loginRes.headers.get('set-cookie') ?? '').split(';')[0].split('=')[1];

    const logoutRes = await postLogout(makeRequest('http://localhost/api/auth/logout', { cookie: sessionCookie(token) }));
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.headers.get('set-cookie')).toContain('Max-Age=0');

    const session = await prisma.session.findFirst({
      where: { tokenHash: createHash('sha256').update(token).digest('hex') },
    });
    expect(session).toBeNull();
    const evt = await latestAudit('LOGOUT');
    expect(evt?.userId).not.toBeNull();
  }, 30000);

  it('password reset: forgot issues a hashed one-time token, reset rotates the password, and reuse fails', async () => {
    setBrevoEnv();
    sendMail.mockReset();
    sendMail.mockResolvedValue({ messageId: 'msg-123' });
    __resetTransporterCache();

    const forgotRes = await postForgot(makeRequest('http://localhost/api/auth/forgot-password', { body: { email } }));
    expect(forgotRes.status).toBe(200);
    expect(sendMail).toHaveBeenCalledTimes(1);
    const mailArgs = sendMail.mock.calls[0][0];
    expect(mailArgs.from).toBe('Payroll System <sender@brevo-test.com>');
    expect(mailArgs.to).toBe(email);
    expect(mailArgs.subject).toBe('Reset your Payroll System password');
    expect(mailArgs.html).toContain('https://payroll.example.com/reset-password/');

    const resetRecord = await prisma.passwordReset.findFirst({
      where: { user: { email } },
      orderBy: { createdAt: 'desc' },
    });
    expect(resetRecord).not.toBeNull();
    expect(resetRecord?.status).toBe('PENDING');
    expect(resetRecord?.tokenHash).toMatch(/^[a-f0-9]{64}$/);

    // Recover the raw token by re-deriving: cannot — hashed at rest. Create one directly for the flow test.
    const rawToken = `raw-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await prisma.passwordReset.update({ where: { id: resetRecord!.id }, data: { tokenHash: createHash('sha256').update(rawToken).digest('hex') } });

    const resetRes = await postReset(makeRequest('http://localhost/api/auth/reset-password', { body: { token: rawToken, newPassword: 'NewFlow123' } }));
    expect(resetRes.status).toBe(200);

    const user = await prisma.user.findFirst({ where: { email } });
    expect(await bcrypt.compare('NewFlow123', user!.passwordHash)).toBe(true);

    const used = await prisma.passwordReset.findUnique({ where: { id: resetRecord!.id } });
    expect(used?.status).toBe('USED');

    // All prior sessions for the user are invalidated.
    const activeSessions = await prisma.session.count({ where: { userId: user!.id } });
    expect(activeSessions).toBe(0);

    // Token reuse is rejected.
    const reuseRes = await postReset(makeRequest('http://localhost/api/auth/reset-password', { body: { token: rawToken, newPassword: 'Again1234' } }));
    expect(reuseRes.status).toBe(400);

    const evt = await latestAudit('PASSWORD_CHANGED');
    expect(evt?.userId).toBe(user!.id);
  }, 60000);

  it('forgot-password always answers 200, even for unknown emails (no user enumeration)', async () => {
    const res = await postForgot(makeRequest('http://localhost/api/auth/forgot-password', { body: { email: `ghost-${Date.now()}@test.com` } }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.message).toContain('If the account exists');
  }, 30000);

  it('rejects an expired password-reset token with 400', async () => {
    const rawToken = `expired-${Date.now()}`;
    await prisma.passwordReset.create({
      data: {
        userId: (await prisma.user.findFirstOrThrow({ where: { email }})).id,
        tokenHash: createHash('sha256').update(rawToken).digest('hex'),
        expiresAt: new Date(Date.now() - 60_000),
        status: 'PENDING',
      },
    });

    const res = await postReset(
      makeRequest('http://localhost/api/auth/reset-password', {
        body: { token: rawToken, newPassword: 'NewFlow123' },
      }),
    );
    expect(res.status).toBe(400);
  }, 30000);

  it('rejects an invalid (non-existent) password-reset token with 400', async () => {
    const res = await postReset(
      makeRequest('http://localhost/api/auth/reset-password', {
        body: { token: 'does-not-exist', newPassword: 'NewFlow123' },
      }),
    );
    expect(res.status).toBe(400);
  }, 30000);

  it('disambiguates one email shared by two businesses via businessName', async () => {
    const ua = `dup-${Date.now()}`;
    const dupEmail = `dup-${Date.now()}@test.com`;
    const dupPassword = 'DupTest123';
    const stamp = Date.now();
    const bizA = await prisma.business.create({ data: { name: `Dup Biz A ${stamp}` } });
    const bizB = await prisma.business.create({ data: { name: `Dup Biz B ${stamp}` } });
    const hash = await bcrypt.hash(dupPassword, 10);
    await prisma.user.create({
      data: { email: dupEmail, passwordHash: hash, role: 'ADMIN', status: 'ACTIVE', businessId: bizA.id },
    });
    await prisma.user.create({
      data: { email: dupEmail, passwordHash: hash, role: 'ADMIN', status: 'ACTIVE', businessId: bizB.id },
    });

    // Email + password alone is ambiguous: ask for the business name.
    const ambiguous = await postLogin(
      makeRequest('http://localhost/api/auth/login', { body: { email: dupEmail, password: dupPassword }, ua }),
    );
    expect(ambiguous.status).toBe(400);
    expect((await ambiguous.json()).code).toBe('BUSINESS_REQUIRED');

    // Correct business name selects the right account.
    const loginA = await postLogin(
      makeRequest(
        'http://localhost/api/auth/login',
        { body: { email: dupEmail, password: dupPassword, businessName: bizA.name }, ua },
      ),
    );
    expect(loginA.status).toBe(200);
    expect((await loginA.json()).data.businessId).toBe(bizA.id);

    // Matching is case-insensitive.
    const loginB = await postLogin(
      makeRequest(
        'http://localhost/api/auth/login',
        { body: { email: dupEmail, password: dupPassword, businessName: bizB.name.toUpperCase() }, ua },
      ),
    );
    expect(loginB.status).toBe(200);
    expect((await loginB.json()).data.businessId).toBe(bizB.id);

    // Unknown business name fails with the generic error (no enumeration).
    const wrong = await postLogin(
      makeRequest(
        'http://localhost/api/auth/login',
        { body: { email: dupEmail, password: dupPassword, businessName: 'No Such Business' }, ua },
      ),
    );
    expect(wrong.status).toBe(401);
  }, 60000);

  it('lets SUPER_ADMIN log in without a business name', async () => {
    const ua = `super-${Date.now()}`;
    const superEmail = `super-${Date.now()}@test.com`;
    const superPassword = 'SuperTest123';
    await prisma.user.create({
      data: {
        email: superEmail,
        passwordHash: await bcrypt.hash(superPassword, 10),
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        businessId: null,
      },
    });

    const withoutBusiness = await postLogin(
      makeRequest('http://localhost/api/auth/login', { body: { email: superEmail, password: superPassword }, ua }),
    );
    expect(withoutBusiness.status).toBe(200);
    expect((await withoutBusiness.json()).data.role).toBe('SUPER_ADMIN');

    // A supplied business name is tolerated, not required.
    const withBusiness = await postLogin(
      makeRequest(
        'http://localhost/api/auth/login',
        { body: { email: superEmail, password: superPassword, businessName: 'Anything Ltd' }, ua },
      ),
    );
    expect(withBusiness.status).toBe(200);
  }, 60000);
});

