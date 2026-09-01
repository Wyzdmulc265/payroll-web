import { NextRequest, NextResponse } from 'next/server';
import { calculatePayroll, buildStatutoryConfigFromSettings, selectEffectiveSettings, getWorkingDaysInMonth } from '@/lib/payroll-engine';
import prisma from '@/lib/prisma';
import { z } from 'zod';

const payrollInputSchema = z.object({
   basicSalary: z.number().positive(),
   allowances: z.number().nonnegative(),
   normalOvertimeHours: z.number().nonnegative(),
   publicHolidayOvertimeHours: z.number().nonnegative(),
   offDayOvertimeHours: z.number().nonnegative(),
   bonuses: z.number().nonnegative(),
   otherEarnings: z.number().nonnegative(),
   otherDeductions: z.number().nonnegative(),
   // Optional period context: makes settings selection and overtime rates
   // period-aware (YYYY-MM). Defaults to the current month.
   payrollPeriod: z.string().regex(/^\d{4}-\d{2}$/).optional(),
 });

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedInput = payrollInputSchema.parse(body);
    const { payrollPeriod, ...input } = validatedInput;

    // Settings effective at the end of the (optional) period — historical
    // previews use the rates that were in force then, not current ones.
    const [year, month] = (payrollPeriod
      ? payrollPeriod.split('-').map(Number)
      : [new Date().getFullYear(), new Date().getMonth() + 1]) as [number, number];
    const periodEnd = new Date(year, month, 0);

    // Load statutory config from Settings (falls back to defaults).
    const configSettings = await prisma.settings.findMany();
    const configMap = selectEffectiveSettings(
      configSettings.map((s) => ({ key: s.key, value: s.value, effectiveFrom: s.effectiveFrom })),
      periodEnd
    );
    const config = buildStatutoryConfigFromSettings(configMap);

    const result = calculatePayroll({
      ...input,
      // Period-aware overtime: actual Mon–Fri day count of the month.
      workingDaysInPeriod: getWorkingDaysInMonth(year, month),
    }, config);
    
    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    
    console.error('Payroll calculation error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}