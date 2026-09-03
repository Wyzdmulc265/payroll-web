import { createHash, randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { forgotPasswordSchema } from '@/lib/auth';
import { getRequestIp, logAuditEvent } from '@/lib/audit';
import { sendPasswordResetEmail, redactSmtpError } from '@/lib/mail';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = forgotPasswordSchema.parse(body);

    const user = await prisma.user.findUnique({ where: { email } });
    if (user?.status === 'ACTIVE') {
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
