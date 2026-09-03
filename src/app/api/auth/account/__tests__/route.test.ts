import { describe, expect, it, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { PATCH as patchAccount } from '@/app/api/auth/account/route';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import { SESSION_COOKIE } from '@/lib/auth';

function makeRequest(url: string, cookie?: string, body?: unknown): NextRequest {
  const init: RequestInit =
    body !== undefined
      ? { method: 'PATCH', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }
      : { method: 'PATCH' };
  const request = new Request(url, init);
  if (cookie) request.headers.set('cookie', cookie);
  return new NextRequest(request);
}

function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}`;
}

async function loginAs(userId: string): Promise<string> {
  const plain = `tok-${userId}-${Date.now()}-${Math.random()}`;
  await prisma.session.create({
    data: {
      userId,
      tokenHash: createHash('sha256').update(plain).digest('hex'),
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
  return plain;
}

describe('account route', () => {
  let token: string;
  let userId: string;
  const PASSWORD = 'AccountTest123';

  beforeEach(async () => {
    await prisma.fringeBenefit.deleteMany();
    await prisma.payrollRecord.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.passwordReset.deleteMany();
    await prisma.session.deleteMany();
    await prisma.settings.deleteMany();
    await prisma.employee.deleteMany();
    await prisma.user.deleteMany();
    await prisma.business.deleteMany();

    const hash = await bcrypt.hash(PASSWORD, 10);
    await prisma.business.create({ data: { name: 'Account Test Biz' } });
    const user = await prisma.user.create({
      data: { email: 'account@test.com', passwordHash: hash, role: 'SUPER_ADMIN', status: 'ACTIVE' },
    });
    userId = user.id;
    token = await loginAs(user.id);
  }, 30000);

  it('returns 401 without a session', async () => {
    const res = await patchAccount(makeRequest('http://localhost/api/auth/account'));
    expect(res.status).toBe(401);
  }, 30000);

  it('returns 400 when current password is wrong', async () => {
    const res = await patchAccount(
      makeRequest('http://localhost/api/auth/account', sessionCookie(token), { currentPassword: 'WrongPass1' })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Current password is incorrect');
  }, 30000);

  it('returns 400 when no changes provided', async () => {
    const res = await patchAccount(
      makeRequest('http://localhost/api/auth/account', sessionCookie(token), { currentPassword: PASSWORD })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('No changes provided');
  }, 30000);

  it('updates email without changing password', async () => {
    const res = await patchAccount(
      makeRequest('http://localhost/api/auth/account', sessionCookie(token), {
        currentPassword: PASSWORD,
        email: 'new-account@test.com',
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.email).toBe('new-account@test.com');
  }, 30000);

  it('rejects a duplicate email with 400', async () => {
    await prisma.user.create({
      data: { email: 'other@test.com', passwordHash: await bcrypt.hash('OtherPass1', 10), role: 'SUPER_ADMIN', status: 'ACTIVE' },
    });
    const res = await patchAccount(
      makeRequest('http://localhost/api/auth/account', sessionCookie(token), {
        currentPassword: PASSWORD,
        email: 'other@test.com',
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Email already in use');
  }, 30000);

  it('changes password, invalidates all sessions, and clears cookie', async () => {
    const res = await patchAccount(
      makeRequest('http://localhost/api/auth/account', sessionCookie(token), {
        currentPassword: PASSWORD,
        newPassword: 'NewAccount1',
      })
    );
    expect(res.status).toBe(200);

    const sessions = await prisma.session.count({ where: { userId } });
    expect(sessions).toBe(0);

    const cookieHeader = res.headers.get('set-cookie');
    expect(cookieHeader).toContain('Max-Age=0');
  }, 30000);

  it('changes both email and password in one request', async () => {
    const res = await patchAccount(
      makeRequest('http://localhost/api/auth/account', sessionCookie(token), {
        currentPassword: PASSWORD,
        email: 'both-changed@test.com',
        newPassword: 'BothChanged1',
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.email).toBe('both-changed@test.com');
  }, 30000);

  it('writes ACCOUNT_UPDATED and PASSWORD_CHANGED audit events', async () => {
    await patchAccount(
      makeRequest('http://localhost/api/auth/account', sessionCookie(token), {
        currentPassword: PASSWORD,
        email: 'audit-test@test.com',
        newPassword: 'AuditTest1',
      })
    );

    const events = await prisma.auditLog.findMany({
      where: { userId },
      orderBy: { timestamp: 'desc' },
      take: 2,
    });
    const actions = events.map((e) => e.action);
    expect(actions).toContain('ACCOUNT_UPDATED');
    expect(actions).toContain('PASSWORD_CHANGED');
  }, 30000);
});
