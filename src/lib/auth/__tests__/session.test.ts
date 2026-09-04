import { describe, it, expect, beforeEach } from 'vitest';
import type { NextResponse } from 'next/server';
import prisma from '../../prisma';
import {
  createSession,
  validateSessionToken,
  invalidateSession,
  invalidateAllSessionsForUser,
} from '../session';
import bcrypt from 'bcryptjs';
import { setSessionCookie, clearSessionCookie } from '../cookies';

type TestUser = { id: string; email: string; role: string; status: string; businessId: string | null };
type TestBusiness = { id: string };

const createMockResponse = () => {
  const store = new Map<string, { value: string; options: Record<string, unknown> }>();
  return {
    cookies: {
      set(options: { name: string; value: string; [key: string]: unknown }) {
        const { name, value, ...rest } = options;
        store.set(name, { value, options: rest });
      },
      get(name: string) {
        const entry = store.get(name);
        if (!entry) return undefined;
        return { value: entry.value, ...entry.options };
      },
    },
  };
};

describe('Session Utilities', () => {
  let testUser: TestUser;
  let testBusiness: TestBusiness;

  beforeEach(async () => {
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    await prisma.business.deleteMany();

    const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    testBusiness = await prisma.business.create({
      data: { name: `Session Test Business ${uniqueId}` },
    });

    testUser = await prisma.user.create({
      data: {
        email: `session.test.${uniqueId}@example.com`,
        passwordHash: await bcrypt.hash('password123', 10),
        role: 'ADMIN',
        businessId: testBusiness.id,
        status: 'ACTIVE',
      },
    });
  }, 30000);

  it('creates a session and returns a token with a future expiry', async () => {
    const { token, expiresAt } = await createSession(testUser.id, {
      ipAddress: '127.0.0.1',
      userAgent: 'Test Agent',
    });

    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(expiresAt).toBeInstanceOf(Date);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('validates a fresh token and returns SessionContext', async () => {
    const { token } = await createSession(testUser.id);
    const context = await validateSessionToken(token);

    expect(context).not.toBeNull();
    expect(context!.sessionId).toBeDefined();
    expect(context!.user.id).toBe(testUser.id);
    expect(context!.user.email).toBe(testUser.email);
    expect(context!.user.role).toBe('ADMIN');
    expect(context!.user.businessId).toBe(testBusiness.id);
    expect(context!.expiresAt).toBeInstanceOf(Date);
  });

  it('returns null for an invalid or non-existent token', async () => {
    const context = await validateSessionToken('invalid-token');
    expect(context).toBeNull();
  });

  it('invalidates a session by token', async () => {
    const { token } = await createSession(testUser.id);

    const before = await validateSessionToken(token);
    expect(before).not.toBeNull();

    await invalidateSession(token);

    const after = await validateSessionToken(token);
    expect(after).toBeNull();
  });

  it('invalidates all sessions for a user', async () => {
    const { token: token1 } = await createSession(testUser.id);
    const { token: token2 } = await createSession(testUser.id);

    expect(await validateSessionToken(token1)).not.toBeNull();
    expect(await validateSessionToken(token2)).not.toBeNull();

    await invalidateAllSessionsForUser(testUser.id);

    expect(await validateSessionToken(token1)).toBeNull();
    expect(await validateSessionToken(token2)).toBeNull();
  }, 30000);

  it('rejects an expired session', async () => {
    const { token } = await createSession(testUser.id);

    await prisma.session.updateMany({
      where: { userId: testUser.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const context = await validateSessionToken(token);
    expect(context).toBeNull();
  });

  it('rejects a session for an inactive user', async () => {
    const inactiveUser = await prisma.user.create({
      data: {
        email: `inactive.${Date.now()}@example.com`,
        passwordHash: await bcrypt.hash('password123', 10),
        role: 'VIEWER',
        businessId: testBusiness.id,
        status: 'INACTIVE',
      },
    });

    const { token } = await createSession(inactiveUser.id);
    const context = await validateSessionToken(token);
    expect(context).toBeNull();
  });

  it('sets HttpOnly, SameSite lax, and secure-in-production on session cookies', () => {
    const response = createMockResponse();
    const expiresAt = new Date(Date.now() + 60_000);
    setSessionCookie(response as unknown as NextResponse, 'test-token', expiresAt);

    const cookie = response.cookies.get('payroll_session') as Record<string, unknown> | undefined;
    expect(cookie).toBeDefined();
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.sameSite).toBe('lax');
    expect(cookie!.secure).toBe(process.env.NODE_ENV === 'production');
    expect(cookie!.path).toBe('/');
  });

  it('clears the session cookie with maxAge 0 and empty value', () => {
    const response = createMockResponse();
    clearSessionCookie(response as unknown as NextResponse);

    const cookie = response.cookies.get('payroll_session') as Record<string, unknown> | undefined;
    expect(cookie).toBeDefined();
    expect(cookie!.value).toBe('');
    expect(cookie!.maxAge).toBe(0);
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.sameSite).toBe('lax');
    expect(cookie!.path).toBe('/');
  });
});
