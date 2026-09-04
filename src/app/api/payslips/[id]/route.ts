import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { formatCurrency } from '@/lib/payroll-engine';
import { getCurrentUser, unauthorized, requirePermission, Permission } from '@/lib/auth';
import { decryptPii } from '@/lib/encryption';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getCurrentUser(request);
    if (!session) return unauthorized();
    const denied = requirePermission(session.user, Permission.READ_PAYROLL);
    if (denied) return denied;
    if (!session.user.businessId) return unauthorized();
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const payrollPeriod = searchParams.get('period');

    if (!payrollPeriod) {
      return NextResponse.json(
        { success: false, error: 'Payroll period required' },
        { status: 400 }
      );
    }

    // Get payroll record
    const payrollRecord = await prisma.payrollRecord.findFirst({
      where: {
        payrollPeriod,
        employeeId: id,
        businessId: session.user.businessId,
      },
      include: {
        employee: true,
        fringeBenefits: true,
      },
    });

    if (!payrollRecord) {
      return NextResponse.json(
        { success: false, error: 'Payslip not found' },
        { status: 404 }
      );
    }

    // Get company settings
    const settings = await prisma.settings.findMany({
      where: { category: 'COMPANY', businessId: session.user.businessId },
    });
    const settingsMap = Object.fromEntries(settings.map(s => [s.key, s.value]));

    const employee = decryptPii(payrollRecord.employee);

    const payslip = {
      // Company Info
      companyName: settingsMap.company_name || 'WizTech Solutions Ltd',
      companyAddress: settingsMap.company_address || 'P.O. Box 1234, Blantyre, Malawi',
      companyPhone: settingsMap.company_phone || '+265 1 123 4567',
      companyEmail: settingsMap.company_email || 'payroll@wiztech.mw',
      companyTPIN: settingsMap.company_tpin || 'TPIN12345678',
      pensionFund: settingsMap.company_pension_fund || 'NICO Pension Fund',

      // Period Info
      payrollPeriod: payrollRecord.payrollPeriod,
      periodStart: payrollRecord.periodStart.toISOString().split('T')[0],
      periodEnd: payrollRecord.periodEnd.toISOString().split('T')[0],

      // Employee Info
      employeeId: employee.employeeId,
      fullName: employee.fullName,
      nationalId: employee.nationalId,
      department: employee.department,
      position: employee.position,
      employmentDate: employee.employmentDate.toISOString().split('T')[0],
      bankName: employee.bankName,
      accountNumber: employee.accountNumber,
      paymentMethod: employee.paymentMethod,
      taxStatus: employee.taxStatus,

      // Earnings
      basicSalary: Number(payrollRecord.basicSalary),
      allowances: Number(payrollRecord.allowances),
      overtimePay: Number(payrollRecord.overtimePay),
      bonuses: Number(payrollRecord.bonuses),
      otherEarnings: Number(payrollRecord.otherEarnings),
      grossEarnings: Number(payrollRecord.grossEarnings),

      // Deductions
      paye: Number(payrollRecord.paye),
      pensionEE: Number(payrollRecord.pensionEE),
      otherDeductions: Number(payrollRecord.otherDeductions),
      totalDeductions: Number(payrollRecord.totalDeductions),

      // Net Pay
      netPay: Number(payrollRecord.netPay),

      // Employer Contributions
      pensionER: Number(payrollRecord.pensionER),
      tevetLevy: Number(payrollRecord.tevetLevy),
      fringeBenefitBase: Number(payrollRecord.fringeBenefitBase),
      fringeBenefitTax: Number(payrollRecord.fringeBenefitTax),
      employerCost: Number(payrollRecord.employerCost),

      fbtSummary: payrollRecord.fbtSnapshot
        ? {
            totalTaxableValue: (payrollRecord.fbtSnapshot as Record<string, unknown>).totalTaxableValue,
            fbtRate: (payrollRecord.fbtSnapshot as Record<string, unknown>).fbtRate,
            fringeBenefitsTax: (payrollRecord.fbtSnapshot as Record<string, unknown>).fringeBenefitsTax,
            benefits: (payrollRecord.fbtSnapshot as Record<string, unknown>).benefits,
          }
        : null,

      // Formatted values
      formatted: {
        basicSalary: formatCurrency(Number(payrollRecord.basicSalary)),
        allowances: formatCurrency(Number(payrollRecord.allowances)),
        overtimePay: formatCurrency(Number(payrollRecord.overtimePay)),
        bonuses: formatCurrency(Number(payrollRecord.bonuses)),
        otherEarnings: formatCurrency(Number(payrollRecord.otherEarnings)),
        grossEarnings: formatCurrency(Number(payrollRecord.grossEarnings)),
        paye: formatCurrency(Number(payrollRecord.paye)),
        pensionEE: formatCurrency(Number(payrollRecord.pensionEE)),
        otherDeductions: formatCurrency(Number(payrollRecord.otherDeductions)),
        totalDeductions: formatCurrency(Number(payrollRecord.totalDeductions)),
        netPay: formatCurrency(Number(payrollRecord.netPay)),
        pensionER: formatCurrency(Number(payrollRecord.pensionER)),
        tevetLevy: formatCurrency(Number(payrollRecord.tevetLevy)),
        fringeBenefitBase: formatCurrency(Number(payrollRecord.fringeBenefitBase)),
        fringeBenefitTax: formatCurrency(Number(payrollRecord.fringeBenefitTax)),
        employerCost: formatCurrency(Number(payrollRecord.employerCost)),
      },
    };

    return NextResponse.json({ success: true, data: payslip });
  } catch (error) {
    console.error('Error fetching payslip:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}