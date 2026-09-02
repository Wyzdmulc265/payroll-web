import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period');
    const employeeId = searchParams.get('employeeId');

    if (!period || !employeeId) {
      return NextResponse.json(
        { success: false, error: 'Period and employeeId are required' },
        { status: 400 }
      );
    }

    const payrollRecord = await prisma.payrollRecord.findFirst({
      where: { payrollPeriod: period, employeeId },
      include: {
        employee: {
          select: { employeeId: true, firstName: true, lastName: true, department: true, position: true },
        },
        fringeBenefits: true,
      },
    });

    if (!payrollRecord) {
      return NextResponse.json(
        { success: false, error: 'Payroll record not found' },
        { status: 404 }
      );
    }

    const fbtSnapshot = payrollRecord.fbtSnapshot as {
      totalTaxableValue: number;
      fbtRate: number;
      fringeBenefitsTax: number;
      benefits: Array<{
        type: string;
        classification: string;
        selectedTaxableValue: number;
        ruleUsed: string;
        auditTrail: Array<{
          rule: string;
          source: string;
          formula: string;
          inputs: Record<string, unknown>;
          result: number;
        }>;
      }>;
    } | null;

    return NextResponse.json({
      success: true,
      data: {
        employeeId: payrollRecord.employee.employeeId,
        employeeName: `${payrollRecord.employee.firstName} ${payrollRecord.employee.lastName}`,
        department: payrollRecord.employee.department,
        position: payrollRecord.employee.position,
        payrollPeriod: payrollRecord.payrollPeriod,
        fringeBenefitBase: Number(payrollRecord.fringeBenefitBase),
        fringeBenefitTax: Number(payrollRecord.fringeBenefitTax),
        fbtSnapshot,
        fringeBenefits: payrollRecord.fringeBenefits.map(fb => ({
          id: fb.id,
          type: fb.type,
          description: fb.description,
          amount: Number(fb.amount),
          taxableValue: Number(fb.taxableValue),
          createdAt: fb.createdAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    console.error('Error fetching FBT data:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
