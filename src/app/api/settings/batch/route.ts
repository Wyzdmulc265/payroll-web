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

const batchSchema = z.array(settingSchema).min(1);

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentUser(request);
    if (!session) return unauthorized();
    const denied = requirePermission(session.user, Permission.MANAGE_SETTINGS);
    if (denied) return denied;
    if (!session.user.businessId) return unauthorized();
    const businessId = session.user.businessId;
    const body = await request.json();
    const validatedData = batchSchema.parse(body);

    const hasStatutory = validatedData.some((row) => row.category === 'STATUTORY');
    if (hasStatutory) {
      const allSettings = await prisma.settings.findMany({ where: { businessId } });
      const settingsMap = Object.fromEntries(allSettings.map((s) => [s.key, s.value]));
      for (const row of validatedData) {
        settingsMap[row.key] = row.value;
      }
      const config = buildStatutoryConfigFromSettings(settingsMap);
      const bandError = validateTaxBands(config.taxBands);
      if (bandError) {
        return NextResponse.json({ success: false, error: bandError }, { status: 400 });
      }
    }

    const results = await prisma.$transaction(
      validatedData.map((row) =>
        prisma.settings.upsert({
          where: { key_businessId: { key: row.key, businessId } },
          update: {
            value: row.value,
            description: row.description,
            category: row.category,
            effectiveFrom: row.effectiveFrom ? new Date(row.effectiveFrom) : new Date(),
            business: { connect: { id: businessId } },
          },
          create: {
            ...row,
            effectiveFrom: row.effectiveFrom ? new Date(row.effectiveFrom) : new Date(),
            business: { connect: { id: businessId } },
          },
        })
      )
    );

    await logAuditEvent({
      action: 'SETTINGS_BATCH_UPDATED',
      entityType: 'Settings',
      entityId: 'batch',
      userId: session.user.id,
      businessId,
      description: `Batch updated ${results.length} setting(s)`,
      newData: validatedData,
      ipAddress: getRequestIp(request),
    });

    return NextResponse.json({ success: true, data: results });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error batch updating settings:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
