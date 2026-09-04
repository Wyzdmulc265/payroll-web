import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import {
  getCurrentUser,
  unauthorized,
  verifyPassword,
  hashPassword,
  updateOwnAccountSchema,
} from '@/lib/auth';
import { getRequestIp, logAuditEvent, AuditAction, AuditEntity } from '@/lib/audit';
import { clearSessionCookie, invalidateAllSessionsForUser } from '@/lib/auth';
import { safeUserSelect } from '@/lib/auth/user-management';

const statusSchema = z.enum(['ACTIVE', 'INACTIVE']);

const querySchema = z.object({
  status: statusSchema.optional(),
});

export async function PATCH(request: NextRequest) {
  try {
    const session = await getCurrentUser(request);
    if (!session) return unauthorized();

    const { searchParams } = new URL(request.url);
    const statusParse = querySchema.safeParse(Object.fromEntries(searchParams.entries()));
    if (!statusParse.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid query parameter', details: statusParse.error.errors },
        { status: 400 }
      );
    }

    const body = await request.json();
    const validated = updateOwnAccountSchema.parse(body);

    const existing = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, email: true, passwordHash: true, role: true, status: true, businessId: true },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    if (!(await verifyPassword(validated.currentPassword, existing.passwordHash))) {
      return NextResponse.json(
        { success: false, error: 'Current password is incorrect' },
        { status: 400 }
      );
    }

    if (validated.email === undefined && validated.newPassword === undefined) {
      return NextResponse.json(
        { success: false, error: 'No changes provided' },
        { status: 400 }
      );
    }

    if (validated.email && validated.email !== existing.email) {
      const clash = await prisma.user.findFirst({
        where: { email: validated.email, businessId: existing.businessId, id: { not: existing.id } },
      });
      if (clash) {
        return NextResponse.json(
          { success: false, error: 'Email already in use' },
          { status: 400 }
        );
      }
    }

    let passwordChanged = false;
    let emailChanged = false;
    const previousData: Record<string, unknown> = { email: existing.email, status: existing.status };

    const updated = await prisma.$transaction(async (tx) => {
      const data: { email?: string; passwordHash?: string } = {};
      if (validated.email && validated.email !== existing.email) {
        data.email = validated.email;
        emailChanged = true;
      }
      if (validated.newPassword) {
        data.passwordHash = await hashPassword(validated.newPassword);
        passwordChanged = true;
      }

      const result = await tx.user.update({
        where: { id: session.user.id },
        data,
        select: safeUserSelect,
      });

      const events: { action: string; newData: Record<string, unknown> }[] = [];
      if (emailChanged) {
        events.push({
          action: AuditAction.ACCOUNT_UPDATED,
          newData: { email: result.email },
        });
      }
      if (passwordChanged) {
        events.push({
          action: AuditAction.PASSWORD_CHANGED,
          newData: { passwordChanged: true },
        });
      }

      for (const evt of events) {
        await logAuditEvent({
          action: evt.action,
          entityType: AuditEntity.Auth,
          entityId: session.user.id,
          userId: session.user.id,
          businessId: result.businessId,
          description: evt.action === AuditAction.ACCOUNT_UPDATED
            ? `Updated account email to ${result.email}`
            : 'Password changed through account settings',
          previousData,
          newData: evt.newData,
          ipAddress: getRequestIp(request),
        }, tx);
      }

      return result;
    }, { timeout: 15000, maxWait: 10000 });

    const response = NextResponse.json({ success: true, data: updated });

    if (passwordChanged) {
      await invalidateAllSessionsForUser(session.user.id);
      clearSessionCookie(response);
    }

    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error updating account:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
