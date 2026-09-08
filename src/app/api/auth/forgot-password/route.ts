import { createHash, randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { forgotPasswordSchema } from '@/lib/auth';
import { getRequestIp, logAuditEvent } from '@/lib/audit';
import { sendPasswordResetEmail, redactSmtpError } from '@/lib/mail';
import { checkRateLimit, pruneExpiredPasswordResets } from '@/lib/auth/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, businessName } = forgotPasswordSchema.parse(body);
    const attemptedBusiness = businessName?.trim() || undefined;

    // Throttle reset requests: per-email stops an attacker email-bombing a
    // single victim; per-IP stops spraying many accounts. The generic response
    // body keeps the no-enumeration guarantee intact.
    const ipAddress = getRequestIp(request) ?? 'unknown';
    for (const key of [`forgot:${email.toLowerCase()}`, `forgot:${ipAddress}`]) {
      const limit = await checkRateLimit(key, 5, 60 * 60 * 1000);
      if (!limit.allowed) {
        return NextResponse.json(
          {
            success: false,
            error: 'Too many reset requests. Try again later.',
            retryAfterSeconds: limit.retryAfterSeconds,
          },
          { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
        );
      }
        }

    // Probabilistic background cleanup: prune expired password-reset tokens
    // ~5% of the time so the password_resets table cannot grow without bound.
    // The per-user deleteMany above only cleans tokens for users actively
    // requesting a reset; this catches the long-tail of never-used expirations.
    if (Math.random() < 0.05) {
      void pruneExpiredPasswordResets().catch(() => undefined);
    }

    // Email is unique per business, so one address may map to several
    // accounts. Resolve the target set: an explicit business name selects
    // that business's account (SUPER_ADMIN keeps its login exception and is
    // selected when nothing else matches); without one, a single account is
    // used directly, while several accounts each get their own reset token —
    // every token is bound to its userId, so any of the emailed links works
    // for its own account. The response stays generic either way (no user
    // enumeration).
    const candidates = await prisma.user.findMany({
      where: { email, status: 'ACTIVE' },
      include: { business: true },
    });
    const eligible = candidates.filter(
      (u) => u.businessId === null || u.business?.status !== 'INACTIVE',
    );

    let targets = eligible;
    if (attemptedBusiness) {
      const tenantMatches = eligible.filter(
        (u) =>
          u.businessId !== null &&
          u.business?.name.trim().toLowerCase() === attemptedBusiness.toLowerCase(),
      );
      targets =
        tenantMatches.length > 0
          ? tenantMatches
          : eligible.filter((u) => u.role === 'SUPER_ADMIN');
    }

    for (const user of targets) {
      // Bound row growth: drop this user's already-expired one-time tokens
      // before minting another.
      await prisma.passwordReset.deleteMany({
        where: { userId: user.id, expiresAt: { lte: new Date() } },
      });

      const token = randomBytes(32).toString('hex');
      await prisma.$transaction(async (tx) => {
        await tx.passwordReset.create({
          data: {
            userId: user.id,
            tokenHash: createHash('sha256').update(token).digest('hex'),
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          },
        });
        await logAuditEvent({
          action: 'FORGOT_PASSWORD_REQUESTED',
          entityType: 'Auth',
          entityId: user.id,
          userId: user.id,
          businessId: user.businessId,
          description: 'Password reset requested',
          ipAddress: getRequestIp(request),
        }, tx);
      });

      try {
        await sendPasswordResetEmail(user.email, token);
      } catch (mailError) {
        console.error('Failed to send password-reset email:', redactSmtpError(mailError));
      }
    }

    return NextResponse.json({ success: true, data: { message: 'If the account exists, reset instructions have been sent.' } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'Validation error', details: error.errors }, { status: 400 });
    }
    console.error('Error requesting password reset:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
