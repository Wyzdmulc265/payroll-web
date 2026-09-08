import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { z } from 'zod';
import { getCurrentUser, unauthorized, requirePermission, Permission } from '@/lib/auth';
import { getRequestIp, logAuditEvent } from '@/lib/audit';
import { buildStatutoryConfigFromSettings, selectEffectiveSettings, validateTaxBands } from '@/lib/payroll-engine';
import { DEPARTMENTS_SETTING_KEY, validateDepartmentsValue } from '@/lib/departments';

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

    const all = await prisma.settings.findMany({
      where,
      orderBy: [{ category: 'asc' }, { key: 'asc' }, { effectiveFrom: 'desc' }],
    });

    // Settings are now history-aware (multiple rows per key, keyed on
    // effectiveFrom). Collapse to the single most recently-effective row per
    // key so the client's key → value map (and payslip/report defaults) always
    // sees the active value, never a stale or random one.
    const seen = new Set<string>();
    const settings = all.filter((row) => {
      if (seen.has(row.key)) return false;
      seen.add(row.key);
      return true;
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

    const existing = await prisma.settings.findMany({
      where: { key, businessId },
      orderBy: { effectiveFrom: 'desc' },
      take: 1,
    });
    if (existing.length === 0) {
      return NextResponse.json({ success: false, error: 'Setting not found' }, { status: 404 });
    }
    const latest = existing[0];
    // Delete every effective-dated row for this key (the whole history).
    await prisma.$transaction(async (tx) => {
      await tx.settings.deleteMany({ where: { key, businessId } });
      await logAuditEvent({
        action: 'SETTINGS_DELETED', entityType: 'Settings', entityId: latest.id,
        userId: session.user.id, businessId,
        description: `Deleted setting ${key}`, previousData: latest,
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

    if (validatedData.key === DEPARTMENTS_SETTING_KEY) {
      const deptError = validateDepartmentsValue(validatedData.value);
      if (deptError) {
        return NextResponse.json({ success: false, error: deptError }, { status: 400 });
      }
    }

    if (validatedData.category === 'STATUTORY') {
      // Collapse settings history to the latest-effective value per key before
      // validating the proposed change. Object.fromEntries is nondeterministic
      // when multiple effective-dated rows share a key (they now can, after the
      // history-aware uniqueness change).
      const allSettings = await prisma.settings.findMany({ where: { businessId } });
      const settingsMap = selectEffectiveSettings(
        allSettings.map((s) => ({ key: s.key, value: s.value, effectiveFrom: s.effectiveFrom })),
        new Date(),
      );
      settingsMap[validatedData.key] = validatedData.value;
      // buildStatutoryConfigFromSettings throws on invalid bands — convert
      // to a 400 with the validation message instead of a 500.
      let config;
      try {
        config = buildStatutoryConfigFromSettings(settingsMap);
      } catch (e) {
        return NextResponse.json(
          { success: false, error: e instanceof Error ? e.message : 'Invalid statutory configuration' },
          { status: 400 },
        );
      }
      const bandError = validateTaxBands(config.taxBands);
      if (bandError) {
        return NextResponse.json({ success: false, error: bandError }, { status: 400 });
      }
    }

    const effectiveFrom = validatedData.effectiveFrom ? new Date(validatedData.effectiveFrom) : new Date();
    // Multiple effective-dated rows per key are allowed, so the upsert targets
    // the (key, businessId, effectiveFrom) tuple. Saving a new value with a new
    // date inserts a fresh history row; re-saving the same value on the same
    // date updates it in place.
    const compound = { key: validatedData.key, businessId, effectiveFrom };
    const existing = await prisma.settings.findUnique({
      where: { key_businessId_effectiveFrom: compound },
    });
    const setting = await prisma.$transaction(async (tx) => {
      const updated = await tx.settings.upsert({
        where: { key_businessId_effectiveFrom: compound },
        update: {
          value: validatedData.value,
          description: validatedData.description,
          category: validatedData.category,
          business: { connect: { id: businessId } },
        },
        create: {
          ...validatedData,
          effectiveFrom,
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
      // Explicit timeouts (see batch route): the default 5 s budget can expire
      // on cold/pooled connections, surfacing as 500 "Internal server error".
    }, { timeout: 15000, maxWait: 10000 });

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