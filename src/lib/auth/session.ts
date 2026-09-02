import { createHash, randomBytes } from 'node:crypto';
import type { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import type { AuthUser, SessionContext } from './types';

export const SESSION_COOKIE = 'payroll_session';
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const userSelect = {
  id: true,
  email: true,
  role: true,
  status: true,
  businessId: true,
} as const;

export async function createSession(
  userId: string,
  metadata?: { ipAddress?: string; userAgent?: string }
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
    },
  });

  return { token, expiresAt };
}

export async function validateSessionToken(token: string): Promise<SessionContext | null> {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: userSelect } },
  });

  if (!session) return null;
  if (session.expiresAt <= new Date() || session.user.status !== 'ACTIVE') {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  return {
    sessionId: session.id,
    expiresAt: session.expiresAt,
    user: session.user as AuthUser,
  };
}

export async function getSessionContext(request: NextRequest): Promise<SessionContext | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  return token ? validateSessionToken(token) : null;
}

export async function invalidateSession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

export async function invalidateAllSessionsForUser(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}
