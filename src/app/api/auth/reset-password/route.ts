import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { hashPassword, invalidateAllSessionsForUser, resetPasswordSchema } from '@/lib/auth';
import { getRequestIp, logAuditEvent } from '@/lib/audit';
import { checkRateLimit } from '@/lib/auth/rate-limit';

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
    await invalidateAllSessionsForUser(reset.userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'Validation error', details: error.errors }, { status: 400 });
    }
    console.error('Error resetting password:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
