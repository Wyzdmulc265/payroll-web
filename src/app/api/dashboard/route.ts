import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { formatCurrency, buildStatutoryConfigFromSettings } from '@/lib/payroll-engine';

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

    // Load statutory config from Settings (falls back to defaults).
    const configSettings = await prisma.settings.findMany();
    const configMap = Object.fromEntries(configSettings.map((s) => [s.key, s.value]));
    const config = buildStatutoryConfigFromSettings(configMap);

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
    const totalFBT = records.reduce((sum, r) => sum + Number(r.fringeBenefitTax), 0);

    // Payroll by department
    const byDepartment = records.reduce((acc, r) => {
      const dept = r.employee.department;
      if (!acc[dept]) {
        acc[dept] = {
          department: dept,
          employees: 0,
          gross: 0,
          net: 0,
          paye: 0,
          pensionEE: 0,
          pensionER: 0,
          fbt: 0,
          employerCost: 0,
        };
      }
      acc[dept].employees += 1;
      acc[dept].gross += Number(r.grossEarnings);
      acc[dept].net += Number(r.netPay);
      acc[dept].paye += Number(r.paye);
      acc[dept].pensionEE += Number(r.pensionEE);
      acc[dept].pensionER += Number(r.pensionER);
      acc[dept].fbt += Number(r.fringeBenefitTax);
      acc[dept].employerCost += Number(r.employerCost);
      return acc;
    }, {} as Record<string, {
      department: string;
      employees: number;
      gross: number;
      net: number;
      paye: number;
      pensionEE: number;
      pensionER: number;
      fbt: number;
      employerCost: number;
    }>);

    // Monthly trend (last 12 months)
    const monthlyTrend = await prisma.payrollRecord.groupBy({
      by: ['payrollPeriod'],
      where: { payrollPeriod: { lte: period } },
      _sum: {
        grossEarnings: true,
        netPay: true,
        paye: true,
        fringeBenefitTax: true,
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
        currency: config.currency,
        kpis: {
          activeEmployees,
          grossPayroll: totalGross,
          totalDeductions,
          netPayroll: totalNetPay,
          paye: totalPAYE,
          pensionEE: totalPensionEE,
          pensionER: totalPensionER,
          fbt: totalFBT,
          employerCost: totalEmployerCost,
          formatted: {
            grossPayroll: formatCurrency(totalGross, config.currency, config.decimalPlaces),
            totalDeductions: formatCurrency(totalDeductions, config.currency, config.decimalPlaces),
            netPayroll: formatCurrency(totalNetPay, config.currency, config.decimalPlaces),
            paye: formatCurrency(totalPAYE, config.currency, config.decimalPlaces),
            pensionEE: formatCurrency(totalPensionEE, config.currency, config.decimalPlaces),
            pensionER: formatCurrency(totalPensionER, config.currency, config.decimalPlaces),
            fbt: formatCurrency(totalFBT, config.currency, config.decimalPlaces),
            employerCost: formatCurrency(totalEmployerCost, config.currency, config.decimalPlaces),
          },
        },
        charts: {
          payrollByDepartment: Object.values(byDepartment).map(d => ({
            department: d.department,
            employees: d.employees,
            gross: d.gross,
            net: d.net,
            paye: d.paye,
            pensionEE: d.pensionEE,
            pensionER: d.pensionER,
            fbt: d.fbt,
            employerCost: d.employerCost,
          })),
          monthlyTrend: monthlyTrend.slice().reverse().map(m => ({
            period: m.payrollPeriod,
            gross: Number(m._sum.grossEarnings || 0),
            net: Number(m._sum.netPay || 0),
            paye: Number(m._sum.paye || 0),
            fbt: Number(m._sum.fringeBenefitTax || 0),
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