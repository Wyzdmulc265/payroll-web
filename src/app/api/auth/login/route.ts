import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import {
  clearLoginRateLimit,
  checkLoginRateLimit,
  createSession,
  setSessionCookie,
  verifyPassword,
  loginSchema,
} from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';

export async function POST(request: NextRequest) {
  const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const key = `${ipAddress}:${request.headers.get('user-agent') ?? 'unknown'}`;
  const limit = await checkLoginRateLimit(key);

  if (!limit.allowed) {
    return NextResponse.json(
      { success: false, error: 'Too many login attempts', retryAfterSeconds: limit.retryAfterSeconds },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

   try {
      const body = await request.json();
      const { email, password } = loginSchema.parse(body);

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || user.status !== 'ACTIVE' || !(await verifyPassword(password, user.passwordHash))) {
        await logAuditEvent({ action: 'LOGIN_FAILED', entityType: 'Auth', description: 'Failed login attempt', ipAddress });
        return NextResponse.json({ success: false, error: 'Invalid email or password' }, { status: 401 });
      }

      const business = user.businessId
        ? await prisma.business.findUnique({ where: { id: user.businessId } })
        : null;

      await clearLoginRateLimit(key);
      const session = await prisma.$transaction(async (tx) => {
        const created = await createSession(user.id, {
          ipAddress,
          userAgent: request.headers.get('user-agent') ?? undefined,
        }, tx);
        await logAuditEvent({ action: 'LOGIN_SUCCESS', entityType: 'Auth', entityId: user.id, userId: user.id, businessId: user.businessId, description: 'User logged in', ipAddress }, tx);
        return created;
      });
      const response = NextResponse.json({
        success: true,
        data: { id: user.id, email: user.email, role: user.role, businessId: user.businessId, businessName: business?.name ?? null },
      });
      setSessionCookie(response, session.token, session.expiresAt);
      return response;
   } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'Validation error', details: error.errors }, { status: 400 });
    }
    console.error('Error logging in:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
