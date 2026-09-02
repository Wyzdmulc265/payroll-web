import { NextRequest, NextResponse } from 'next/server';
import { calculatePayroll, buildStatutoryConfigFromSettings, selectEffectiveSettings, getWorkingDaysInMonth } from '@/lib/payroll-engine';
import { FringeBenefitType, BenefitPaymentMethod } from '@/lib/fbt-engine';
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
   fringeBenefits: z.array(z.object({
     type: z.string(),
     description: z.string().optional(),
     paymentMethod: z.string().optional(),
     amount: z.number().nonnegative().default(0),
     employeeContribution: z.number().nonnegative().default(0).optional(),
     effectiveFrom: z.string(),
     effectiveTo: z.string().optional(),
     originalCost: z.number().nonnegative().default(0).optional(),
     furnished: z.boolean().optional(),
     ownershipType: z.enum(['EMPLOYER_OWNED', 'RENTED']).optional(),
     employerRentalCost: z.number().nonnegative().default(0).optional(),
     openMarketRentalValue: z.number().nonnegative().default(0).optional(),
     benchmarkInterestRate: z.number().nonnegative().default(0).optional(),
     employerInterestRate: z.number().nonnegative().default(0).optional(),
     principalAmount: z.number().nonnegative().default(0).optional(),
   })).optional(),
   // Optional period context: makes settings selection and overtime rates
   // period-aware (YYYY-MM). Defaults to the current month.
   payrollPeriod: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  });

export async function POST(request: NextRequest) {
   try {
     const body = await request.json();
     const validatedInput = payrollInputSchema.parse(body);
     const { payrollPeriod, fringeBenefits, ...input } = validatedInput;

     const benefits = (fringeBenefits ?? []).map(b => ({
       ...b,
       type: b.type as FringeBenefitType,
       paymentMethod: b.paymentMethod as BenefitPaymentMethod | undefined,
       effectiveFrom: new Date(b.effectiveFrom),
       effectiveTo: b.effectiveTo ? new Date(b.effectiveTo) : undefined,
     }));

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
        fringeBenefits: benefits,
        // Period-aware overtime: actual Mon–Fri day count of the month.
        workingDaysInPeriod: getWorkingDaysInMonth(year, month),
      }, config, configMap);

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