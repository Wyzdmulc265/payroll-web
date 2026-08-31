import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { formatCurrency } from '@/lib/payroll-engine';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period');

    if (!period) {
      // Return available periods
      const periods = await prisma.payrollRecord.findMany({
        select: { payrollPeriod: true },
        distinct: ['payrollPeriod'],
        orderBy: { payrollPeriod: 'desc' },
      });
      return NextResponse.json({
        success: true,
        data: { periods: periods.map(p => p.payrollPeriod) },
      });
    }

    // Get all payroll records for the period
    const records = await prisma.payrollRecord.findMany({
      where: { payrollPeriod: period },
      include: { employee: true },
    });

    // KPIs
    const activeEmployees = await prisma.employee.count({ where: { isActive: true } });
    const totalGross = records.reduce((sum, r) => sum + Number(r.grossEarnings), 0);
    const totalDeductions = records.reduce((sum, r) => sum + Number(r.totalDeductions), 0);
    const totalNetPay = records.reduce((sum, r) => sum + Number(r.netPay), 0);
    const totalPAYE = records.reduce((sum, r) => sum + Number(r.paye), 0);
    const totalPensionEE = records.reduce((sum, r) => sum + Number(r.pensionEE), 0);
    const totalPensionER = records.reduce((sum, r) => sum + Number(r.pensionER), 0);
    const totalEmployerCost = records.reduce((sum, r) => sum + Number(r.employerCost), 0);

    // Payroll by department
    const byDepartment = records.reduce((acc, r) => {
      const dept = r.employee.department;
      if (!acc[dept]) {
        acc[dept] = { department: dept, employees: 0, gross: 0, net: 0, paye: 0 };
      }
      acc[dept].employees += 1;
      acc[dept].gross += Number(r.grossEarnings);
      acc[dept].net += Number(r.netPay);
      acc[dept].paye += Number(r.paye);
      return acc;
    }, {} as Record<string, { department: string; employees: number; gross: number; net: number; paye: number }>);

    // Monthly trend (last 12 months)
    const monthlyTrend = await prisma.payrollRecord.groupBy({
      by: ['payrollPeriod'],
      where: { payrollPeriod: { lte: period } },
      _sum: {
        grossEarnings: true,
        netPay: true,
        paye: true,
      },
      orderBy: { payrollPeriod: 'desc' },
      take: 12,
    });

    // Employee headcount trend
    const headcountTrend = await prisma.payrollRecord.groupBy({
      by: ['payrollPeriod'],
      where: { payrollPeriod: { lte: period } },
      _count: { employeeId: true },
      orderBy: { payrollPeriod: 'desc' },
      take: 12,
    });

    return NextResponse.json({
      success: true,
      data: {
        period,
        kpis: {
          activeEmployees,
          grossPayroll: totalGross,
          totalDeductions,
          netPayroll: totalNetPay,
          paye: totalPAYE,
          pensionEE: totalPensionEE,
          pensionER: totalPensionER,
          employerCost: totalEmployerCost,
          formatted: {
            grossPayroll: formatCurrency(totalGross),
            totalDeductions: formatCurrency(totalDeductions),
            netPayroll: formatCurrency(totalNetPay),
            paye: formatCurrency(totalPAYE),
            pensionEE: formatCurrency(totalPensionEE),
            pensionER: formatCurrency(totalPensionER),
            employerCost: formatCurrency(totalEmployerCost),
          },
        },
        charts: {
          payrollByDepartment: Object.values(byDepartment).map(d => ({
            department: d.department,
            employees: d.employees,
            gross: d.gross,
            net: d.net,
            paye: d.paye,
          })),
          monthlyTrend: monthlyTrend.slice().reverse().map(m => ({
            period: m.payrollPeriod,
            gross: Number(m._sum.grossEarnings || 0),
            net: Number(m._sum.netPay || 0),
            paye: Number(m._sum.paye || 0),
          })),
          headcountTrend: headcountTrend.slice().reverse().map(h => ({
            period: h.payrollPeriod,
            count: h._count.employeeId,
          })),
        },
      },
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}