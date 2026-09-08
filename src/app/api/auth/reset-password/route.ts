import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { hashPassword, invalidateAllSessionsForUser, resetPasswordSchema } from '@/lib/auth';
import { getRequestIp, logAuditEvent } from '@/lib/audit';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { sendPasswordChangedNotification, redactSmtpError } from '@/lib/mail';

/** Fire-and-forget helper: looks up the user's email and sends a notification. */
async function notifyPasswordChanged(
  userId: string,
  opts: { ipAddress?: string; userAgent?: string },
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user?.email) return;

  await sendPasswordChangedNotification(user.email, {
    ipAddress: opts.ipAddress,
    userAgent: opts.userAgent,
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  });
}

/**
 * GET /api/auth/reset-password?token=...
 * Lightweight token pre-validation so the reset page can show an inline
 * "this link has expired" state before the user fills in the password form.
 * Uses a separate, more generous rate-limit bucket than POST so page loads
 * never consume the redemption budget, but still throttles token-guessing.
 */
export async function GET(request: NextRequest) {
  try {
    const ipAddress = getRequestIp(request) ?? 'unknown';
    const limit = await checkRateLimit(`reset-validate:${ipAddress}`, 30, 15 * 60 * 1000);
    if (!limit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'Too many validation attempts. Try again later.',
          retryAfterSeconds: limit.retryAfterSeconds,
        },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
      );
    }

    const token = request.nextUrl.searchParams.get('token');
    if (!token) {
      return NextResponse.json({ success: true, valid: false });
    }

    const tokenHash = createHash('sha256').update(token).digest('hex');
    const reset = await prisma.passwordReset.findUnique({ where: { tokenHash } });
    const valid = !!reset && reset.status === 'PENDING' && reset.expiresAt > new Date();

    return NextResponse.json({ success: true, valid });
  } catch (error) {
    console.error('Error validating reset token:', error);
    // Fail closed on internal errors: treat the token as invalid rather than
    // exposing a 500 to the pre-validation path. POST still enforces the
    // authoritative check on submission.
    return NextResponse.json({ success: true, valid: false });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Throttle reset-token redemption per IP to slow down token-guessing
    // (64 random hex chars are infeasible to brute-force; this is defence in
    // depth) and to blunt scripted abuse of a leaked token.
    const ipAddress = getRequestIp(request) ?? 'unknown';
    const limit = await checkRateLimit(`reset:${ipAddress}`, 10, 15 * 60 * 1000);
    if (!limit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'Too many reset attempts. Try again later.',
          retryAfterSeconds: limit.retryAfterSeconds,
        },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
      );
    }

    const body = await request.json();
    const { token, newPassword } = resetPasswordSchema.parse({
      token: body.token,
      newPassword: body.newPassword ?? body.password,
    });

    const tokenHash = createHash('sha256').update(token).digest('hex');
    const reset = await prisma.passwordReset.findUnique({ where: { tokenHash } });
    if (!reset || reset.status !== 'PENDING' || reset.expiresAt <= new Date()) {
      return NextResponse.json({ success: false, error: 'Invalid or expired reset token' }, { status: 400 });
    }

    await prisma.$transaction(async (transaction) => {
      await transaction.user.update({ where: { id: reset.userId }, data: { passwordHash: await hashPassword(newPassword) } });
      await transaction.passwordReset.update({ where: { id: reset.id }, data: { status: 'USED' } });
      // Invalidate all sessions atomically with the password change so that a
      // DB error rolling back the transaction also rolls back the session wipe
      // (and vice-versa). This closes the window where a password is rotated
      // but old session tokens remain valid because the invalidation ran
      // outside the transaction.
      await invalidateAllSessionsForUser(reset.userId, transaction);
      const user = await transaction.user.findUnique({ where: { id: reset.userId }, select: { businessId: true } });
      await logAuditEvent({
        action: 'PASSWORD_CHANGED',
        entityType: 'Auth',
        entityId: reset.userId,
        userId: reset.userId,
        businessId: user?.businessId,
        description: 'Password changed through reset flow',
        ipAddress: getRequestIp(request),
      }, transaction);
    }, { timeout: 15000, maxWait: 10000 });

    // Fire-and-forget: notify the user that their password was changed.
    // This is deliberately outside the transaction — a mail failure must
    // not undo the password rotation. Failures are logged (redacted) but
    // never block the response.
    void notifyPasswordChanged(reset.userId, {
      ipAddress: getRequestIp(request) ?? undefined,
      userAgent: request.headers.get('user-agent') ?? undefined,
    }).catch((err) =>
      console.error('Failed to send password-changed notification:', redactSmtpError(err)),
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'Validation error', details: error.errors }, { status: 400 });
    }
    console.error('Error resetting password:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
