import { NextRequest, NextResponse } from 'next/server';
import prisma, { Prisma } from '@/lib/prisma';
import { formatCurrency, buildStatutoryConfigFromSettings } from '@/lib/payroll-engine';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'Payroll Register';
    const period = searchParams.get('period');
    const department = searchParams.get('department');

    if (!period) {
      return NextResponse.json(
        { success: false, error: 'Period required' },
        { status: 400 }
      );
    }

    // Load statutory config from Settings (falls back to defaults).
    const configSettings = await prisma.settings.findMany();
    const configMap = Object.fromEntries(configSettings.map((s) => [s.key, s.value]));
    const config = buildStatutoryConfigFromSettings(configMap);

    const where: Prisma.PayrollRecordWhereInput = { payrollPeriod: period };
    if (department && department !== 'All') {
      where.department = department;
    }

    const records = await prisma.payrollRecord.findMany({
      where,
      include: {
        employee: {
          select: {
            employeeId: true,
            firstName: true,
            lastName: true,
            fullName: true,
            department: true,
            position: true,
            bankName: true,
            accountNumber: true,
          },
        },
      },
      orderBy: [{ department: 'asc' }, { employeeId: 'asc' }],
    });

    let reportData: Array<Array<string | number | null>> = [];
    let headers: string[] = [];

    switch (type) {
      case 'Payroll Register':
        headers = [
          'Employee ID', 'Employee Name', 'Department', 'Position',
          'Basic Salary', 'Allowances', 'Overtime Pay', 'Bonuses',
          'Other Earnings', 'Gross Earnings', 'PAYE', 'Pension (EE)',
          'Pension (ER)', 'TEVET Levy', 'FBT Base', 'FBT', 'Other Deductions', 'Total Deductions',
          'Net Pay', 'Employer Cost'
        ];
        reportData = records.map(r => [
          r.employee.employeeId,
          r.employee.fullName,
          r.employee.department,
          r.employee.position,
          formatCurrency(Number(r.basicSalary)),
          formatCurrency(Number(r.allowances)),
          formatCurrency(Number(r.overtimePay)),
          formatCurrency(Number(r.bonuses)),
          formatCurrency(Number(r.otherEarnings)),
          formatCurrency(Number(r.grossEarnings)),
          formatCurrency(Number(r.paye)),
          formatCurrency(Number(r.pensionEE)),
          formatCurrency(Number(r.pensionER)),
          formatCurrency(Number(r.tevetLevy)),
          formatCurrency(Number(r.fringeBenefitBase)),
          formatCurrency(Number(r.fringeBenefitTax)),
          formatCurrency(Number(r.otherDeductions)),
          formatCurrency(Number(r.totalDeductions)),
          formatCurrency(Number(r.netPay)),
          formatCurrency(Number(r.employerCost)),
        ]);
        break;

      case 'Payroll Summary':
        // Group by department
        const deptSummary = records.reduce((acc, r) => {
          const dept = r.employee.department;
          if (!acc[dept]) {
            acc[dept] = {
              department: dept,
              employees: 0,
              grossPayroll: 0,
              totalAllowances: 0,
              totalOvertime: 0,
              totalBonuses: 0,
              totalGross: 0,
              totalPAYE: 0,
              totalPensionEE: 0,
              totalPensionER: 0,
              totalTEVET: 0,
              totalFBT: 0,
              totalOtherDed: 0,
              totalDeductions: 0,
              totalNetPay: 0,
              totalEmployerCost: 0,
            };
          }
          const d = acc[dept];
          d.employees += 1;
          d.grossPayroll += Number(r.basicSalary);
          d.totalAllowances += Number(r.allowances);
          d.totalOvertime += Number(r.overtimePay);
          d.totalBonuses += Number(r.bonuses);
          d.totalGross += Number(r.grossEarnings);
          d.totalPAYE += Number(r.paye);
          d.totalPensionEE += Number(r.pensionEE);
          d.totalPensionER += Number(r.pensionER);
          d.totalTEVET += Number(r.tevetLevy);
          d.totalFBT += Number(r.fringeBenefitTax);
          d.totalOtherDed += Number(r.otherDeductions);
          d.totalDeductions += Number(r.totalDeductions);
          d.totalNetPay += Number(r.netPay);
          d.totalEmployerCost += Number(r.employerCost);
          return acc;
        }, {} as Record<string, {
          department: string;
          employees: number;
          grossPayroll: number;
          totalAllowances: number;
          totalOvertime: number;
          totalBonuses: number;
          totalGross: number;
          totalPAYE: number;
          totalPensionEE: number;
          totalPensionER: number;
          totalTEVET: number;
          totalFBT: number;
          totalOtherDed: number;
          totalDeductions: number;
          totalNetPay: number;
          totalEmployerCost: number;
        }>);

        headers = [
          'Department', 'Employees', 'Gross Payroll', 'Total Allowances',
          'Total Overtime', 'Total Bonuses', 'Total Gross',
          'Total PAYE', 'Total Pension EE', 'Total Pension ER',
          'Total TEVET', 'Total FBT', 'Total Other Ded', 'Total Deductions', 'Total Net Pay',
          'Total Employer Cost'
        ];
        reportData = Object.values(deptSummary).map(d => [
          d.department, d.employees,
          formatCurrency(d.grossPayroll), formatCurrency(d.totalAllowances),
          formatCurrency(d.totalOvertime), formatCurrency(d.totalBonuses),
          formatCurrency(d.totalGross), formatCurrency(d.totalPAYE),
          formatCurrency(d.totalPensionEE), formatCurrency(d.totalPensionER),
          formatCurrency(d.totalTEVET), formatCurrency(d.totalFBT),
          formatCurrency(d.totalOtherDed), formatCurrency(d.totalDeductions),
          formatCurrency(d.totalNetPay), formatCurrency(d.totalEmployerCost),
        ]);
        break;

      case 'Statutory Summary':
        const totalGross = records.reduce((sum, r) => sum + Number(r.grossEarnings), 0);
        const totalPAYE = records.reduce((sum, r) => sum + Number(r.paye), 0);
        const totalPensionEE = records.reduce((sum, r) => sum + Number(r.pensionEE), 0);
        const totalPensionER = records.reduce((sum, r) => sum + Number(r.pensionER), 0);
        const totalTEVET = records.reduce((sum, r) => sum + Number(r.grossEarnings) * (config.tevetLevyPercent / 100), 0);
        const totalFBTBase = records.reduce((sum, r) => sum + Number(r.fringeBenefitBase), 0);
        const totalFBT = records.reduce((sum, r) => sum + Number(r.fringeBenefitTax), 0);

        headers = ['Period', 'Total Gross', 'Total PAYE', 'Total Pension EE', 'Total Pension ER', 'Total TEVET Levy', 'Total FBT Base', 'Total FBT', 'Total Employer Statutory Cost'];
        reportData = [[
          period,
          formatCurrency(totalGross),
          formatCurrency(totalPAYE),
          formatCurrency(totalPensionEE),
          formatCurrency(totalPensionER),
          formatCurrency(totalTEVET),
          formatCurrency(totalFBTBase),
          formatCurrency(totalFBT),
          formatCurrency(totalPensionER + totalTEVET + totalFBTBase + totalFBT),
        ]];
        break;

      case 'Department Payroll':
        headers = [
          'Department', 'Employees', 'Basic Salary', 'Allowances',
          'Overtime', 'Bonuses', 'Other Earnings', 'Gross Earnings',
          'PAYE', 'Pension EE', 'Pension ER', 'TEVET Levy', 'FBT', 'Other Ded',
          'Total Ded', 'Net Pay', 'Employer Cost'
        ];
        reportData = records.map(r => [
          r.employee.department, 1,
          formatCurrency(Number(r.basicSalary)), formatCurrency(Number(r.allowances)),
          formatCurrency(Number(r.overtimePay)), formatCurrency(Number(r.bonuses)),
          formatCurrency(Number(r.otherEarnings)), formatCurrency(Number(r.grossEarnings)),
          formatCurrency(Number(r.paye)), formatCurrency(Number(r.pensionEE)),
          formatCurrency(Number(r.pensionER)), formatCurrency(Number(r.tevetLevy)),
          formatCurrency(Number(r.fringeBenefitTax)), formatCurrency(Number(r.otherDeductions)),
          formatCurrency(Number(r.totalDeductions)), formatCurrency(Number(r.netPay)),
          formatCurrency(Number(r.employerCost)),
        ]);
        break;

      case 'Bank Payment Schedule':
        headers = ['Bank Name', 'Account Number', 'Employee ID', 'Employee Name', 'Net Pay'];
        reportData = records
          .filter(r => r.employee.bankName && r.employee.accountNumber)
          .map(r => [
            r.employee.bankName!,
            r.employee.accountNumber!,
            r.employee.employeeId,
            r.employee.fullName,
            formatCurrency(Number(r.netPay)),
          ]);
        break;

      case 'Employee Earnings History':
        if (!department || department === 'All') {
          return NextResponse.json(
            { success: false, error: 'Department/Employee required for Earnings History' },
            { status: 400 }
          );
        }
        // Get history for specific employee
        const employeeId = searchParams.get('employeeId');
        const whereHistory: Prisma.PayrollRecordWhereInput = { payrollPeriod: { lte: period } };
        if (employeeId) whereHistory.employeeId = employeeId;

        const history = await prisma.payrollRecord.findMany({
          where: whereHistory,
          include: { employee: { select: { employeeId: true, firstName: true, lastName: true } } },
          orderBy: { payrollPeriod: 'asc' },
        });

        headers = [
          'Payroll Period', 'Basic Salary', 'Allowances', 'Overtime',
          'Bonuses', 'Other Earnings', 'Gross Earnings',
          'PAYE', 'Pension EE', 'Other Ded', 'Total Ded', 'Net Pay',
          'Fringe Benefit Base', 'FBT'
        ];
        reportData = history.map(r => [
          r.payrollPeriod,
          formatCurrency(Number(r.basicSalary)), formatCurrency(Number(r.allowances)),
          formatCurrency(Number(r.overtimePay)), formatCurrency(Number(r.bonuses)),
          formatCurrency(Number(r.otherEarnings)), formatCurrency(Number(r.grossEarnings)),
          formatCurrency(Number(r.paye)), formatCurrency(Number(r.pensionEE)),
          formatCurrency(Number(r.otherDeductions)), formatCurrency(Number(r.totalDeductions)),
          formatCurrency(Number(r.netPay)),
          formatCurrency(Number(r.fringeBenefitBase)),
          formatCurrency(Number(r.fringeBenefitTax)),
        ]);
        break;

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid report type' },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      data: {
        type,
        period,
        department: department || 'All',
        headers,
        rows: reportData,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error generating report:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}