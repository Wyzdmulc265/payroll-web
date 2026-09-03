import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import {
  getCurrentUser,
  unauthorized,
  requirePermission,
  Permission,
  updateBusinessSchema,
} from '@/lib/auth';
import { getRequestIp, logAuditEvent, AuditAction, AuditEntity } from '@/lib/audit';

/**
 * Phase 9 business management (single business). SUPER_ADMIN only.
 * Same isolation rule as the collection route: metadata and lifecycle only —
 * no payroll/employee/settings data of the business is exposed here.
 */

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
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { users: true, employees: true, payrollRecords: true } },
      },
    });

    if (!business) {
      return NextResponse.json(
        { success: false, error: 'Business not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: business });
  } catch (error) {
    console.error('Error fetching business:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const session = await getCurrentUser(request);
    if (!session) return unauthorized();
    const denied = requirePermission(session.user, Permission.MANAGE_BUSINESSES);
    if (denied) return denied;

    const { id } = await context.params;
    const body = await request.json();
    const validated = updateBusinessSchema.parse(body);

    const existing = await prisma.business.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Business not found' },
        { status: 404 }
      );
    }

    // Neon cold-starts can exceed Prisma's 5s default interactive-transaction
    // timeout (P2028 → 500); 15s matches the auth/user-management routes.
    const business = await prisma.$transaction(
      async (tx) => {
        const updated = await tx.business.update({
          where: { id },
          data: {
            ...(validated.name !== undefined ? { name: validated.name } : {}),
            ...(validated.status !== undefined ? { status: validated.status } : {}),
          },
          select: { id: true, name: true, status: true },
        });

      await logAuditEvent({
        action: AuditAction.BUSINESS_UPDATED,
        entityType: AuditEntity.Business,
        entityId: updated.id,
        userId: session.user.id,
        businessId: updated.id,
        description:
          validated.status && validated.status !== existing.status
            ? `Set business "${updated.name}" status to ${updated.status}`
            : `Updated business "${updated.name}"`,
        previousData: { name: existing.name, status: existing.status },
        newData: { name: updated.name, status: updated.status },
        ipAddress: getRequestIp(request),
      }, tx);

      // Deactivating a business cuts every active session of its users
      // immediately. The users themselves stay ACTIVE so re-enabling the
      // business restores access without per-user churn.
      if (validated.status === 'INACTIVE' && existing.status === 'ACTIVE') {
        await tx.session.deleteMany({
          where: { user: { businessId: id } },
        });
      }

      return updated;
    }, { timeout: 15000, maxWait: 10000 });

    return NextResponse.json({ success: true, data: business });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error updating business:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
