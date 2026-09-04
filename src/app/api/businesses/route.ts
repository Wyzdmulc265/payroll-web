import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import type { BusinessStatus } from '../../../../prisma/generated/client';
import {
  getCurrentUser,
  unauthorized,
  requirePermission,
  Permission,
  hashPassword,
  createBusinessSchema,
} from '@/lib/auth';
import { getRequestIp, logAuditEvent, AuditAction, AuditEntity } from '@/lib/audit';

/**
 * Phase 9 business management. SUPER_ADMIN only (`MANAGE_BUSINESSES` is held
 * by no other role). Deliberately does NOT require `session.user.businessId`:
 * SUPER_ADMIN has no business of its own, and these routes manage businesses
 * rather than reading any business's payroll data.
 *
 * Isolation rule (see AUTH-TODO Phase 9): listing/counting businesses is
 * metadata. SUPER_ADMIN still cannot read or mutate a business's payroll
 * through any business-scoped route — those keep rejecting it (403) until an
 * explicit support/business-selection flow exists.
 */

export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentUser(request);
    if (!session) return unauthorized();
    const denied = requirePermission(session.user, Permission.MANAGE_BUSINESSES);
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50')));
    const skip = (page - 1) * limit;
    const statusParam = searchParams.get('status');
    const statusFilter = statusParam === 'ACTIVE' || statusParam === 'INACTIVE' ? statusParam : undefined;
    const where = statusFilter ? { status: statusFilter as BusinessStatus } : undefined;

    const [businesses, total] = await Promise.all([
      prisma.business.findMany({
        where,
        select: {
          id: true,
          name: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { users: true, employees: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.business.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: businesses,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Error fetching businesses:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentUser(request);
    if (!session) return unauthorized();
    const denied = requirePermission(session.user, Permission.MANAGE_BUSINESSES);
    if (denied) return denied;

    const body = await request.json();
    const validated = createBusinessSchema.parse(body);

    // No duplicate-email guard here by design: email is unique per business
    // (User @@unique([email, businessId])), so the initial admin's address
    // may already exist in another business — or as a SUPER_ADMIN — and that
    // is legitimate. The DB constraint still rejects a true duplicate within
    // the new business (impossible at creation time: it has no users yet).
    const adminPasswordHash = validated.initialAdmin
      ? await hashPassword(validated.initialAdmin.password)
      : null;

    const result = await prisma.$transaction(
      async (tx) => {
        const business = await tx.business.create({
          data: { name: validated.name },
          select: { id: true, name: true, status: true, createdAt: true },
        });

      await logAuditEvent({
        action: AuditAction.BUSINESS_CREATED,
        entityType: AuditEntity.Business,
        entityId: business.id,
        userId: session.user.id,
        // Attribute the event to the new business so its own audit trail
        // records how it came to exist.
        businessId: business.id,
        description: `Created business "${business.name}"`,
        newData: { name: business.name },
        ipAddress: getRequestIp(request),
      }, tx);

      let initialAdmin: { id: string; email: string } | null = null;
      if (validated.initialAdmin && adminPasswordHash) {
        initialAdmin = await tx.user.create({
          data: {
            email: validated.initialAdmin.email,
            passwordHash: adminPasswordHash,
            role: 'ADMIN',
            status: 'ACTIVE',
            business: { connect: { id: business.id } },
          },
          select: { id: true, email: true },
        });

        await logAuditEvent({
          action: AuditAction.USER_CREATED,
          entityType: AuditEntity.User,
          entityId: initialAdmin.id,
          userId: session.user.id,
          businessId: business.id,
          description: `Created initial admin ${initialAdmin.email} for business "${business.name}"`,
          newData: { email: initialAdmin.email, role: 'ADMIN' },
          ipAddress: getRequestIp(request),
        }, tx);
      }

      return { business, initialAdmin };
    }, { timeout: 15000, maxWait: 10000 });

    return NextResponse.json(
      { success: true, data: result.business, initialAdmin: result.initialAdmin },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error creating business:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
