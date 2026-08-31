import { NextRequest, NextResponse } from 'next/server';
import { calculatePayroll, buildStatutoryConfigFromSettings } from '@/lib/payroll-engine';
import prisma from '@/lib/prisma';
import { z } from 'zod';

const payrollInputSchema = z.object({
  basicSalary: z.number().positive(),
  allowances: z.number().nonnegative(),
  overtimeHours: z.number().nonnegative(),
  overtimeRate: z.number().positive(),
  bonuses: z.number().nonnegative(),
  otherEarnings: z.number().nonnegative(),
  otherDeductions: z.number().nonnegative(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedInput = payrollInputSchema.parse(body);

    // Load statutory config from Settings (falls back to defaults).
    const configSettings = await prisma.settings.findMany();
    const configMap = Object.fromEntries(configSettings.map((s) => [s.key, s.value]));
    const config = buildStatutoryConfigFromSettings(configMap);

    const result = calculatePayroll(validatedInput, config);
    
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