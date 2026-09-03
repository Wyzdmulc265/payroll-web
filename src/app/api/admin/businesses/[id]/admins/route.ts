import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import {
  getCurrentUser,
  unauthorized,
  requirePermission,
  Permission,
  hashPassword,
  createBusinessAdminSchema,
} from '@/lib/auth';
import { getRequestIp, logAuditEvent, AuditAction, AuditEntity } from '@/lib/audit';
import { safeUserSelect } from '@/lib/auth/user-management';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await getCurrentUser(request);
    if (!session) return unauthorized();
    const denied = requirePermission(session.user, Permission.MANAGE_BUSINESSES);
    if (denied) return denied;

    const { id } = await context.params;

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

    const admins = await prisma.user.findMany({
      where: { businessId: id, role: 'ADMIN' },
      select: safeUserSelect,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: admins });
  } catch (error) {
    console.error('Error fetching business admins:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await getCurrentUser(request);
    if (!session) return unauthorized();
    const denied = requirePermission(session.user, Permission.MANAGE_BUSINESSES);
    if (denied) return denied;

    const { id } = await context.params;

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
    const validated = createBusinessAdminSchema.parse(body);

    const existing = await prisma.user.findFirst({ where: { email: validated.email } });
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Email already in use' },
        { status: 400 }
      );
    }

    const passwordHash = await hashPassword(validated.password);

    const admin = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: validated.email,
          passwordHash,
          role: validated.role,
          status: 'ACTIVE',
          business: { connect: { id: business.id } },
        },
        select: safeUserSelect,
      });

      await logAuditEvent({
        action: AuditAction.USER_CREATED,
        entityType: AuditEntity.User,
        entityId: created.id,
        userId: session.user.id,
        businessId: business.id,
        description: `Created admin ${created.email} for business "${business.name}"`,
        newData: { email: created.email, role: created.role },
        ipAddress: getRequestIp(request),
      }, tx);

      return created;
    }, { timeout: 15000, maxWait: 10000 });

    return NextResponse.json({ success: true, data: admin }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error creating business admin:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
