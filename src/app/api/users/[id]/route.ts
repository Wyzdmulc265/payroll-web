import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma, { type Prisma } from '@/lib/prisma';
import {
  getCurrentUser,
  unauthorized,
  forbidden,
  requirePermission,
  Permission,
  hashPassword,
  updateUserSchema,
} from '@/lib/auth';
import { getRequestIp, logAuditEvent } from '@/lib/audit';
import { safeUserSelect, isManageableRole, isSelfMutation } from '@/lib/auth/user-management';

function sanitizeUser(u: {
  id: string;
  email: string;
  role: string;
  status: string;
  businessId: string | null;
}) {
  return { id: u.id, email: u.email, role: u.role, status: u.status, businessId: u.businessId };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getCurrentUser(request);
    if (!session) return unauthorized();
    const denied = requirePermission(session.user, Permission.READ_USERS);
    if (denied) return denied;
    if (!session.user.businessId) return forbidden();

    const { id } = await params;
    const user = await prisma.user.findFirst({
      where: { id, businessId: session.user.businessId },
      select: safeUserSelect,
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: user });
  } catch (error) {
    console.error('Error fetching user:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getCurrentUser(request);
    if (!session) return unauthorized();
    const denied = requirePermission(session.user, Permission.MANAGE_USERS);
    if (denied) return denied;
    if (!session.user.businessId) return forbidden();

    const { id } = await params;
    const body = await request.json();
    const validatedData = updateUserSchema.parse(body);

    if (validatedData.role !== undefined && !isManageableRole(validatedData.role)) {
      return NextResponse.json(
        { success: false, error: 'Cannot assign that role' },
        { status: 403 }
      );
    }

    if (Object.keys(validatedData).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No changes provided' },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findFirst({
      where: { id, businessId: session.user.businessId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Guard rails for self-mutation: an admin may update their own email and
    // password, but cannot change their own role or deactivate themselves
    // (which would lock them out of the tenant).
    const isSelf = isSelfMutation(session.user.id, id);
    if (isSelf && validatedData.role !== undefined) {
      return NextResponse.json(
        { success: false, error: 'You cannot change your own role' },
        { status: 403 }
      );
    }
    if (isSelf && validatedData.status === 'INACTIVE') {
      return NextResponse.json(
        { success: false, error: 'You cannot deactivate your own account' },
        { status: 403 }
      );
    }

    // Email uniqueness check, scoped to this business (the same address
    // may exist in another business) and excluding the user being updated.
    if (validatedData.email && validatedData.email !== existing.email) {
      const clash = await prisma.user.findFirst({
        where: { email: validatedData.email, businessId: existing.businessId, id: { not: id } },
      });
      if (clash) {
        return NextResponse.json(
          { success: false, error: 'Email already in use' },
          { status: 400 }
        );
      }
    }

    const updateData: Prisma.UserUpdateInput = {};
    if (validatedData.email) updateData.email = validatedData.email;
    if (validatedData.role) updateData.role = validatedData.role;
    if (validatedData.status) updateData.status = validatedData.status;
    if (validatedData.password) {
      updateData.passwordHash = await hashPassword(validatedData.password);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.user.update({
        where: { id },
        data: updateData,
        select: safeUserSelect,
      });

      await logAuditEvent({
        action: 'USER_UPDATED', entityType: 'User', entityId: id,
        userId: session.user.id, businessId: session.user.businessId,
        description: `Updated user ${result.email}`,
        previousData: sanitizeUser(existing),
        newData: sanitizeUser(result),
        ipAddress: getRequestIp(request),
      }, tx);

      return result;
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error updating user:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getCurrentUser(request);
    if (!session) return unauthorized();
    const denied = requirePermission(session.user, Permission.MANAGE_USERS);
    if (denied) return denied;
    if (!session.user.businessId) return forbidden();

    const { id } = await params;

    const existing = await prisma.user.findFirst({
      where: { id, businessId: session.user.businessId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    if (isSelfMutation(session.user.id, id)) {
      return NextResponse.json(
        { success: false, error: 'You cannot deactivate your own account' },
        { status: 403 }
      );
    }

    // Logical deactivation — keeps historical audit rows and records intact.
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.user.update({
        where: { id },
        data: { status: 'INACTIVE' },
        select: safeUserSelect,
      });

      await logAuditEvent({
        action: 'USER_DEACTIVATED', entityType: 'User', entityId: id,
        userId: session.user.id, businessId: session.user.businessId,
        description: `Deactivated user ${result.email}`,
        previousData: sanitizeUser(existing),
        newData: sanitizeUser(result),
        ipAddress: getRequestIp(request),
      }, tx);

      return result;
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error deactivating user:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}