import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import {
  getCurrentUser,
  unauthorized,
  requirePermission,
  Permission,
  hashPassword,
  passwordSchema,
} from '@/lib/auth';
import { getRequestIp, logAuditEvent, AuditAction, AuditEntity } from '@/lib/audit';
import { safeUserSelect } from '@/lib/auth/user-management';

type RouteContext = { params: Promise<{ id: string; userId: string }> };

function sanitizeAdmin(u: {
  id: string;
  email: string;
  role: string;
  status: string;
  businessId: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    status: u.status,
    businessId: u.businessId,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

const updateAdminSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase())
    .optional(),
  password: passwordSchema.optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const session = await getCurrentUser(request);
    if (!session) return unauthorized();
    const denied = requirePermission(session.user, Permission.MANAGE_BUSINESSES);
    if (denied) return denied;

    const { id, userId } = await context.params;

    const business = await prisma.business.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!business) {
      return NextResponse.json(
        { success: false, error: 'Business not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const validated = updateAdminSchema.parse(body);

    if (validated.email === undefined && validated.password === undefined && validated.status === undefined) {
      return NextResponse.json(
        { success: false, error: 'No changes provided' },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findFirst({
      where: { id: userId, businessId: id },
      select: { id: true, email: true, passwordHash: true, role: true, status: true, businessId: true, createdAt: true, updatedAt: true },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Admin not found' },
        { status: 404 }
      );
    }

    if (validated.email && validated.email !== existing.email) {
      const clash = await prisma.user.findFirst({ where: { email: validated.email } });
      if (clash) {
        return NextResponse.json(
          { success: false, error: 'Email already in use' },
          { status: 400 }
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (validated.email) updateData.email = validated.email;
    if (validated.password) updateData.passwordHash = await hashPassword(validated.password);
    if (validated.status) updateData.status = validated.status;

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.user.update({
        where: { id: userId },
        data: updateData,
        select: safeUserSelect,
      });

      await logAuditEvent({
        action: AuditAction.USER_UPDATED,
        entityType: AuditEntity.User,
        entityId: userId,
        userId: session.user.id,
        businessId: business.id,
        description: `Updated admin ${result.email} for business "${business.name}"`,
        previousData: sanitizeAdmin(existing),
        newData: sanitizeAdmin(result),
        ipAddress: getRequestIp(request),
      }, tx);

      return result;
    }, { timeout: 15000, maxWait: 10000 });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error updating business admin:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const session = await getCurrentUser(request);
    if (!session) return unauthorized();
    const denied = requirePermission(session.user, Permission.MANAGE_BUSINESSES);
    if (denied) return denied;

    const { id, userId } = await context.params;

    const business = await prisma.business.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!business) {
      return NextResponse.json(
        { success: false, error: 'Business not found' },
        { status: 404 }
      );
    }

    const existing = await prisma.user.findFirst({
      where: { id: userId, businessId: id },
      select: { id: true, email: true, role: true, status: true, businessId: true, createdAt: true, updatedAt: true },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Admin not found' },
        { status: 404 }
      );
    }

    if (existing.status !== 'ACTIVE') {
      return NextResponse.json(
        { success: false, error: 'Admin is already inactive' },
        { status: 400 }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.user.update({
        where: { id: userId },
        data: { status: 'INACTIVE' },
        select: safeUserSelect,
      });

      await logAuditEvent({
        action: AuditAction.USER_DEACTIVATED,
        entityType: AuditEntity.User,
        entityId: userId,
        userId: session.user.id,
        businessId: business.id,
        description: `Deactivated admin ${result.email} for business "${business.name}"`,
        previousData: sanitizeAdmin(existing),
        newData: sanitizeAdmin(result),
        ipAddress: getRequestIp(request),
      }, tx);

      return result;
    }, { timeout: 15000, maxWait: 10000 });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error deactivating business admin:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
