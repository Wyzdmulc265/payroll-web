import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import {
  getCurrentUser,
  unauthorized,
  forbidden,
  requirePermission,
  Permission,
  hashPassword,
  createUserSchema,
} from '@/lib/auth';
import {
  getRequestIp,
  logAuditEvent,
} from '@/lib/audit';
import { safeUserSelect, isManageableRole } from '@/lib/auth/user-management';

export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentUser(request);
    if (!session) return unauthorized();
    const denied = requirePermission(session.user, Permission.READ_USERS);
    if (denied) return denied;
    if (!session.user.businessId) return forbidden();
    const businessId = session.user.businessId;

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: { businessId },
        select: safeUserSelect,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.user.count({ where: { businessId: session.user.businessId } }),
    ]);

    return NextResponse.json({
      success: true,
      data: users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching users:', error);
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
    const denied = requirePermission(session.user, Permission.MANAGE_USERS);
    if (denied) return denied;
    if (!session.user.businessId) return forbidden();
    const businessId = session.user.businessId;

    const body = await request.json();
    const validatedData = createUserSchema.parse(body);

    // Defense-in-depth: never allow tenant-scoped user creation of a
    // SUPER_ADMIN, regardless of what the schema allowed.
    if (!isManageableRole(validatedData.role)) {
      return NextResponse.json(
        { success: false, error: 'Cannot create a user with that role' },
        { status: 403 }
      );
    }

    const existing = await prisma.user.findFirst({ where: { email: validatedData.email } });
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Email already in use' },
        { status: 400 }
      );
    }

    const passwordHash = await hashPassword(validatedData.password);

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: validatedData.email,
          passwordHash,
          role: validatedData.role,
          status: 'ACTIVE',
          business: { connect: { id: businessId } },
        },
        select: safeUserSelect,
      });

      await logAuditEvent({
        action: 'USER_CREATED', entityType: 'User', entityId: created.id,
        userId: session.user.id, businessId,
        description: `Created ${created.role.toLowerCase()} user ${created.email}`,
        newData: { email: created.email, role: created.role },
        ipAddress: getRequestIp(request),
      }, tx);

      return created;
    });

    return NextResponse.json({ success: true, data: user }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error creating user:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}