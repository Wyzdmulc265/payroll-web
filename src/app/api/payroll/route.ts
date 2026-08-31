import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { calculatePayroll, PayrollInput, buildStatutoryConfigFromSettings } from '@/lib/payroll-engine';
import { z } from 'zod';

const runPayrollSchema = z.object({
  payrollPeriod: z.string().regex(/^\d{4}-\d{2}$/, 'Period must be YYYY-MM'),
  employeeIds: z.array(z.string()).optional(), // If not provided, process all active employees
  overtimeData: z.array(z.object({
    employeeId: z.string(),
    overtimeHours: z.number().nonnegative(),
    overtimeRate: z.number().positive(),
    bonuses: z.number().nonnegative().default(0),
    otherEarnings: z.number().nonnegative().default(0),
    otherDeductions: z.number().nonnegative().default(0),
  })).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = runPayrollSchema.parse(body);

    const { payrollPeriod, employeeIds, overtimeData } = validatedData;
// Load statutory + payroll config from Settings (falls back to defaults)
    const configSettings = await prisma.settings.findMany();
    const configMap = Object.fromEntries(configSettings.map((s) => [s.key, s.value]));
    const config = buildStatutoryConfigFromSettings(configMap);

    // Get period start/end dates
    const [year, month] = payrollPeriod.split('-').map(Number);
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 0); // Last day of month

    // Get employees to process
    const employees = await prisma.employee.findMany({
      where: {
        isActive: true,
        ...(employeeIds && employeeIds.length > 0 ? { id: { in: employeeIds } } : {}),
      },
    });

    if (employees.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No active employees found' },
        { status: 400 }
      );
    }

    // Check if payroll already exists for this period
    const existingCount = await prisma.payrollRecord.count({
      where: { payrollPeriod },
    });

    if (existingCount > 0) {
      return NextResponse.json(
        { success: false, error: `Payroll already exists for period ${payrollPeriod}` },
        { status: 400 }
      );
    }

    // Create overtime lookup map
    const overtimeMap = new Map();
    if (overtimeData) {
      overtimeData.forEach(ot => {
        overtimeMap.set(ot.employeeId, ot);
      });
    }

    // Process each employee
    const payrollRecords = [];
    
    for (const emp of employees) {
      const ot = overtimeMap.get(emp.id) || {};
      
      const input: PayrollInput = {
        basicSalary: Number(emp.basicSalary),
        allowances: Number(emp.allowances),
        overtimeHours: ot.overtimeHours || 0,
        overtimeRate: ot.overtimeRate || config.overtimeRateMultiplier,
        bonuses: ot.bonuses || 0,
        otherEarnings: ot.otherEarnings || 0,
        otherDeductions: ot.otherDeductions || 0,
      };

      const result = calculatePayroll(input, config);

      payrollRecords.push({
        payrollPeriod,
        periodStart,
        periodEnd,
        employeeId: emp.id,
        department: emp.department,
        position: emp.position,
        basicSalary: result.basicSalary,
        allowances: result.allowances,
        overtimeHours: result.overtimeHours,
        overtimeRate: result.overtimeRate,
        overtimePay: result.overtimePay,
        bonuses: result.bonuses,
        otherEarnings: result.otherEarnings,
        grossEarnings: result.grossEarnings,
        paye: result.paye,
        pensionEE: result.pensionEE,
        pensionER: result.pensionER,
        otherDeductions: result.otherDeductions,
        totalDeductions: result.totalDeductions,
        netPay: result.netPay,
        employerCost: result.employerCost,
        runBy: 'system', // TODO: get from auth session
        status: 'Saved',
      });
    }

    // Bulk create payroll records
    await prisma.payrollRecord.createMany({
      data: payrollRecords,
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        user: 'system',
        action: 'PAYROLL_RUN',
        entityType: 'Payroll',
        entityId: payrollPeriod,
        description: `Processed payroll for ${employees.length} employees in period ${payrollPeriod}`,
        newValue: JSON.stringify({ period: payrollPeriod, count: employees.length }),
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        payrollPeriod,
        processedCount: employees.length,
        periodStart,
        periodEnd,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error running payroll:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const payrollPeriod = searchParams.get('period');
    const employeeId = searchParams.get('employeeId');
    const department = searchParams.get('department');

    const where: Prisma.PayrollRecordWhereInput = {};
    if (payrollPeriod) where.payrollPeriod = payrollPeriod;
    if (employeeId) where.employeeId = employeeId;
    if (department && department !== 'All') where.department = department;

    const records = await prisma.payrollRecord.findMany({
      where,
      include: {
        employee: {
          select: {
            employeeId: true,
            firstName: true,
            lastName: true,
            department: true,
            position: true,
          },
        },
      },
      orderBy: [{ payrollPeriod: 'desc' }, { department: 'asc' }],
    });

    // Calculate summary
    const summary = records.reduce(
      (acc, r) => {
        acc.totalGross += Number(r.grossEarnings);
        acc.totalPAYE += Number(r.paye);
        acc.totalPensionEE += Number(r.pensionEE);
        acc.totalPensionER += Number(r.pensionER);
        acc.totalOtherDeductions += Number(r.otherDeductions);
        acc.totalDeductions += Number(r.totalDeductions);
        acc.totalNetPay += Number(r.netPay);
        acc.totalEmployerCost += Number(r.employerCost);
        return acc;
      },
      {
        totalGross: 0,
        totalPAYE: 0,
        totalPensionEE: 0,
        totalPensionER: 0,
        totalOtherDeductions: 0,
        totalDeductions: 0,
        totalNetPay: 0,
        totalEmployerCost: 0,
      }
    );

    return NextResponse.json({
      success: true,
      data: records,
      summary,
    });
  } catch (error) {
    console.error('Error fetching payroll records:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}