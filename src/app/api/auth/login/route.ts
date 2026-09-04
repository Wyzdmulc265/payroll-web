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

const GENERIC_FAILURE = 'Invalid email or password';

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
      const { email, password, businessName } = loginSchema.parse(body);
      const attemptedBusiness = businessName?.trim() || undefined;

      // Email is unique per business (User @@unique([email, businessId])), so
      // one email may resolve to several accounts. Load all of them and
      // verify the password against each candidate.
      const candidates = await prisma.user.findMany({
        where: { email },
        include: { business: true },
      });
      if (candidates.length === 0) {
        await logAuditEvent({
          action: 'LOGIN_FAILED',
          entityType: 'Auth',
          description: attemptedBusiness
            ? `Failed login attempt for unknown email (business "${attemptedBusiness}")`
            : 'Failed login attempt for unknown email',
          ipAddress,
        });
        return NextResponse.json({ success: false, error: GENERIC_FAILURE }, { status: 401 });
      }

      const matches: typeof candidates = [];
      for (const candidate of candidates) {
        if (
          candidate.status === 'ACTIVE' &&
          candidate.businessId !== null &&
          candidate.business?.status === 'INACTIVE'
        ) {
          continue;
        }
        if (
          candidate.status === 'ACTIVE' &&
          (await verifyPassword(password, candidate.passwordHash))
        ) {
          matches.push(candidate);
        }
      }

      if (matches.length === 0) {
        await logAuditEvent({
          action: 'LOGIN_FAILED',
          entityType: 'Auth',
          description: attemptedBusiness
            ? `Failed login attempt (business "${attemptedBusiness}")`
            : 'Failed login attempt',
          ipAddress,
        });
        return NextResponse.json({ success: false, error: GENERIC_FAILURE }, { status: 401 });
      }

      let user = matches[0];
      if (attemptedBusiness) {
        // An explicit business name wins when it matches a password-verified
        // tenant account. Otherwise a SUPER_ADMIN match still logs in — the
        // superadmin exception: no business name is ever required of them.
        const tenantMatch = matches.find(
          (m) =>
            m.businessId !== null &&
            m.business?.name.trim().toLowerCase() === attemptedBusiness.toLowerCase(),
        );
        const superAdminMatch = matches.find((m) => m.role === 'SUPER_ADMIN');
        const selected = tenantMatch ?? superAdminMatch;
        if (!selected) {
          await logAuditEvent({
            action: 'LOGIN_FAILED',
            entityType: 'Auth',
            description: `Failed login attempt (business "${attemptedBusiness}")`,
            ipAddress,
          });
          return NextResponse.json({ success: false, error: GENERIC_FAILURE }, { status: 401 });
        }
        user = selected;
      } else if (matches.length > 1) {
        // Email + password alone cannot pick an account. Ask for the business
        // name without revealing which businesses hold the email.
        return NextResponse.json(
          {
            success: false,
            error: 'Multiple accounts share this email. Enter your business name to continue.',
            code: 'BUSINESS_REQUIRED',
          },
          { status: 400 },
        );
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
