import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { z } from 'zod';
import { getCurrentUser, unauthorized, requirePermission, Permission } from '@/lib/auth';
import { getRequestIp, logAuditEvent } from '@/lib/audit';
import { buildStatutoryConfigFromSettings, validateTaxBands } from '@/lib/payroll-engine';

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
    const businessId = session.user.businessId;
    const key = request.nextUrl.searchParams.get('key');
    if (!key) {
      return NextResponse.json(
        { success: false, error: 'Query parameter "key" is required' },
        { status: 400 }
      );
    }

    const existing = await prisma.settings.findUnique({ where: { key_businessId: { key, businessId } } });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Setting not found' }, { status: 404 });
    }
    await prisma.$transaction(async (tx) => {
      await tx.settings.delete({ where: { key_businessId: { key, businessId } } });
      await logAuditEvent({
        action: 'SETTINGS_DELETED', entityType: 'Settings', entityId: existing.id,
        userId: session.user.id, businessId,
        description: `Deleted setting ${key}`, previousData: existing,
        ipAddress: getRequestIp(request),
      }, tx);
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
    const businessId = session.user.businessId;
    const body = await request.json();
    const validatedData = settingSchema.parse(body);

    if (validatedData.category === 'STATUTORY') {
      const allSettings = await prisma.settings.findMany({ where: { businessId } });
      const settingsMap = Object.fromEntries(allSettings.map((s) => [s.key, s.value]));
      settingsMap[validatedData.key] = validatedData.value;
      const config = buildStatutoryConfigFromSettings(settingsMap);
      const bandError = validateTaxBands(config.taxBands);
      if (bandError) {
        return NextResponse.json({ success: false, error: bandError }, { status: 400 });
      }
    }

    const existing = await prisma.settings.findUnique({
      where: { key_businessId: { key: validatedData.key, businessId } },
    });
    const setting = await prisma.$transaction(async (tx) => {
      const updated = await tx.settings.upsert({
        where: { key_businessId: { key: validatedData.key, businessId } },
        update: {
          value: validatedData.value,
          description: validatedData.description,
          category: validatedData.category,
          effectiveFrom: validatedData.effectiveFrom ? new Date(validatedData.effectiveFrom) : new Date(),
          business: { connect: { id: businessId } },
        },
        create: {
          ...validatedData,
          effectiveFrom: validatedData.effectiveFrom ? new Date(validatedData.effectiveFrom) : new Date(),
          business: { connect: { id: businessId } },
        },
      });

      await logAuditEvent({
        action: existing ? 'SETTINGS_UPDATED' : 'SETTINGS_CREATED',
        entityType: 'Settings', entityId: updated.id,
        userId: session.user.id, businessId,
        description: `${existing ? 'Updated' : 'Created'} setting ${updated.key}`,
        previousData: existing, newData: updated, ipAddress: getRequestIp(request),
      }, tx);

      return updated;
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