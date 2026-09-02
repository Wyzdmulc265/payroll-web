import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { z } from 'zod';
import { getCurrentUser, unauthorized, requirePermission, Permission } from '@/lib/auth';
import { getRequestIp, logAuditEvent } from '@/lib/audit';

const settingSchema = z.object({
  key: z.string(),
  value: z.string(),
  description: z.string().optional(),
  category: z.enum(['COMPANY', 'PAYROLL', 'STATUTORY', 'SYSTEM']),
  effectiveFrom: z.coerce.date().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentUser(request);
    if (!session) return unauthorized();
    const denied = requirePermission(session.user, Permission.READ_SETTINGS);
    if (denied) return denied;
    if (!session.user.businessId) return unauthorized();
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    const where = category ? { category, businessId: session.user.businessId } : { businessId: session.user.businessId };

    const settings = await prisma.settings.findMany({
      where,
      orderBy: [{ category: 'asc' }, { key: 'asc' }],
    });

    return NextResponse.json({ success: true, data: settings });
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getCurrentUser(request);
    if (!session) return unauthorized();
    const denied = requirePermission(session.user, Permission.MANAGE_SETTINGS);
    if (denied) return denied;
    if (!session.user.businessId) return unauthorized();
    const key = request.nextUrl.searchParams.get('key');
    if (!key) {
      return NextResponse.json(
        { success: false, error: 'Query parameter "key" is required' },
        { status: 400 }
      );
    }

    const existing = await prisma.settings.findUnique({ where: { key_businessId: { key, businessId: session.user.businessId } } });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Setting not found' }, { status: 404 });
    }
    await prisma.settings.delete({ where: { key_businessId: { key, businessId: session.user.businessId } } });
    await logAuditEvent({
      action: 'SETTINGS_DELETED', entityType: 'Settings', entityId: existing.id,
      userId: session.user.id, businessId: session.user.businessId,
      description: `Deleted setting ${key}`, previousData: existing,
      ipAddress: getRequestIp(request),
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting setting:', error);
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
    const denied = requirePermission(session.user, Permission.MANAGE_SETTINGS);
    if (denied) return denied;
    if (!session.user.businessId) return unauthorized();
    const body = await request.json();
    const validatedData = settingSchema.parse(body);

    const existing = await prisma.settings.findUnique({
      where: { key_businessId: { key: validatedData.key, businessId: session.user.businessId } },
    });
    const setting = await prisma.settings.upsert({
      where: { key_businessId: { key: validatedData.key, businessId: session.user.businessId } },
      update: {
        value: validatedData.value,
        description: validatedData.description,
        category: validatedData.category,
        effectiveFrom: validatedData.effectiveFrom ? new Date(validatedData.effectiveFrom) : new Date(),
        business: { connect: { id: session.user.businessId } },
      },
      create: {
        ...validatedData,
        effectiveFrom: validatedData.effectiveFrom ? new Date(validatedData.effectiveFrom) : new Date(),
        business: { connect: { id: session.user.businessId } },
      },
    });

    await logAuditEvent({
      action: existing ? 'SETTINGS_UPDATED' : 'SETTINGS_CREATED',
      entityType: 'Settings', entityId: setting.id,
      userId: session.user.id, businessId: session.user.businessId,
      description: `${existing ? 'Updated' : 'Created'} setting ${setting.key}`,
      previousData: existing, newData: setting, ipAddress: getRequestIp(request),
    });

    return NextResponse.json({ success: true, data: setting });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error creating/updating setting:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}