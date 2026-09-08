import { NextRequest, NextResponse } from 'next/server';
import prisma, { Prisma } from '@/lib/prisma';
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

    for (const row of validatedData) {
      if (row.key === DEPARTMENTS_SETTING_KEY) {
        const deptError = validateDepartmentsValue(row.value);
        if (deptError) {
          return NextResponse.json({ success: false, error: deptError }, { status: 400 });
        }
      }
    }

    const hasStatutory = validatedData.some((row) => row.category === 'STATUTORY');
    if (hasStatutory) {
      const allSettings = await prisma.settings.findMany({ where: { businessId } });
      // Collapse settings history to the latest-effective value per key before
      // validating the batch. Object.fromEntries is nondeterministic when
      // multiple effective-dated rows share a key (they now can, after the
      // history-aware uniqueness change).
      const settingsMap = selectEffectiveSettings(
        allSettings.map((s) => ({ key: s.key, value: s.value, effectiveFrom: s.effectiveFrom })),
        new Date(),
      );
      for (const row of validatedData) {
        settingsMap[row.key] = row.value;
      }
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

    // Single-statement batch upsert: the previous N-row interactive
    // $transaction (one round-trip per upsert) exceeded even a 15 s budget
    // on cold/pooled connections (Neon, ~1-3 s per query), expiring the
    // transaction and surfacing as 500 "Internal server error" on PAYROLL /
    // STATUTORY / SYSTEM tabs. A single INSERT ... ON CONFLICT is one
    // round-trip, implicitly atomic, and has no interactive-transaction
    // timeout to expire. businessId is guaranteed non-null above, so the
    // (key, business_id, effective_from) conflict target always applies.
    await prisma.$executeRaw`
      INSERT INTO "settings" ("id", "key", "value", "description", "category", "effective_from", "business_id")
      VALUES ${Prisma.join(
        validatedData.map((row) =>
          Prisma.sql`(gen_random_uuid(), ${row.key}, ${row.value}, ${row.description ?? null}, ${row.category}, ${row.effectiveFrom ? new Date(row.effectiveFrom) : new Date()}, ${businessId})`,
        ),
      )}
      ON CONFLICT ("key", "business_id", "effective_from") DO UPDATE SET
        "value" = EXCLUDED."value",
        "description" = EXCLUDED."description",
        "category" = EXCLUDED."category"
    `;
    // Re-read and collapse to the latest-effective row per key (settings are
    // history-aware; the page expects one active value per key).
    const rawResults = await prisma.settings.findMany({
      where: { businessId, key: { in: validatedData.map((row) => row.key) } },
      orderBy: { effectiveFrom: 'desc' },
    });
    const seen = new Set<string>();
    const results = rawResults.filter((row) => {
      if (seen.has(row.key)) return false;
      seen.add(row.key);
      return true;
    });

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
