'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Users, DollarSign, CreditCard, TrendingUp, Settings, 
  FileText, Calculator, ArrowRight, Home, Building2,
  Download, Upload, Search, Filter, Plus, Edit, Trash2,
  Eye, Download as DownloadIcon, Printer, AlertCircle,
  CheckCircle, XCircle, Loader2, BarChart3, Banknote,
  Building, UserPlus, FileSpreadsheet, ClipboardList
} from 'lucide-react';
import { formatCurrency } from '@/lib/payroll-engine';

interface DashboardData {
  period: string;
  kpis: {
    activeEmployees: number;
    grossPayroll: number;
    totalDeductions: number;
    netPayroll: number;
    paye: number;
    pensionEE: number;
    pensionER: number;
    employerCost: number;
    formatted: {
      grossPayroll: string;
      totalDeductions: string;
      netPayroll: string;
      paye: string;
      pensionEE: string;
      pensionER: string;
      employerCost: string;
    };
  };
  charts: {
    payrollByDepartment: Array<{
      department: string;
      employees: number;
      gross: number;
      net: number;
      paye: number;
    }>;
    monthlyTrend: Array<{
      period: string;
      gross: number;
      net: number;
      paye: number;
    }>;
    headcountTrend: Array<{
      period: string;
      count: number;
    }>;
  };
}

interface PeriodOption {
  period: string;
}

export default function HomePage() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [periods, setPeriods] = useState<string[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string>('2026-08');
  const [loading, setLoading] = useState(true);

  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard?period=${selectedPeriod}`);
      const data = await res.json();
      if (data.success) {
        setDashboardData(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPeriods = async () => {
    try {
      const res = await fetch('/api/dashboard');
      const data = await res.json();
      if (data.success && data.data.periods) {
        setPeriods(data.data.periods);
        if (!selectedPeriod && data.data.periods.length > 0) {
          setSelectedPeriod(data.data.periods[0]);
        }
      }
    } catch (error) {
      console.error('Failed to fetch periods:', error);
    }
  };

  useEffect(() => {
    fetchPeriods();
  }, []);

  useEffect(() => {
    if (selectedPeriod) {
      fetchDashboard();
    }
  }, [selectedPeriod]);

  const navigation = [
    { name: 'Home', href: '/', icon: Home, current: true },
    { name: 'Employees', href: '/employees', icon: Users, current: false },
    { name: 'Payroll', href: '/payroll', icon: Calculator, current: false },
    { name: 'Payslips', href: '/payslips', icon: FileText, current: false },
    { name: 'Reports', href: '/reports', icon: BarChart3, current: false },
    { name: 'Dashboard', href: '/dashboard', icon: TrendingUp, current: false },
    { name: 'Settings', href: '/settings', icon: Settings, current: false },
  ];

  const kpiCards = [
    { label: 'Active Employees', value: dashboardData?.kpis.activeEmployees?.toString() || '0', icon: Users, color: 'bg-blue-500', trend: null },
    { label: 'Gross Payroll', value: dashboardData?.kpis.formatted.grossPayroll || 'MWK 0.00', icon: DollarSign, color: 'bg-green-500', trend: '+12%' },
    { label: 'Total Deductions', value: dashboardData?.kpis.formatted.totalDeductions || 'MWK 0.00', icon: CreditCard, color: 'bg-red-500', trend: '+5%' },
    { label: 'Net Payroll', value: dashboardData?.kpis.formatted.netPayroll || 'MWK 0.00', icon: Banknote, color: 'bg-purple-500', trend: '+15%' },
    { label: 'PAYE', value: dashboardData?.kpis.formatted.paye || 'MWK 0.00', icon: Building, color: 'bg-orange-500', trend: '+8%' },
    { label: 'Employer Cost', value: dashboardData?.kpis.formatted.employerCost || 'MWK 0.00', icon: Building2, color: 'bg-indigo-500', trend: '+10%' },
  ];

  if (loading && !dashboardData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 hidden lg:block">
        <div className="flex flex-col h-full">
          <div className="p-6 border-b border-gray-200">
            <h1 className="text-xl font-bold text-primary">WizTech Payroll</h1>
            <p className="text-xs text-gray-500 mt-1">v1.0 - Malawi</p>
          </div>
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  item.current
                    ? 'bg-primary-light text-primary'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </Link>
            ))}
          </nav>
          <div className="p-4 border-t border-gray-200">
            <p className="text-xs text-gray-500 text-center">
              Current Period: {selectedPeriod}
            </p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:ml-64 min-h-screen">
        {/* Top Bar */}
        <header className="sticky top-0 z-40 bg-white border-b border-gray-200">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-4">
              <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
              <span className="px-2 py-1 text-xs font-medium bg-primary-light text-primary rounded-full">
                {selectedPeriod}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="input w-auto"
              >
                {periods.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <button className="btn-primary">
                <Loader2 className="h-4 w-4 mr-2" />
                Refresh
              </button>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {kpiCards.map((kpi) => (
              <div key={kpi.label} className="card">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-gray-500">{kpi.label}</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{kpi.value}</p>
                    {kpi.trend && (
                      <p className="text-xs text-green-600 mt-1">{kpi.trend} vs last month</p>
                    )}
                  </div>
                  <div className={`p-3 rounded-xl ${kpi.color}`}>
                    <kpi.icon className="h-6 w-6 text-white" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Payroll by Department */}
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Payroll by Department</h3>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Department</th>
                      <th className="text-right">Employees</th>
                      <th className="text-right">Gross Payroll</th>
                      <th className="text-right">Net Payroll</th>
                      <th className="text-right">PAYE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboardData?.charts.payrollByDepartment.map((dept) => (
                      <tr key={dept.department}>
                        <td className="font-medium">{dept.department}</td>
                        <td className="text-right">{dept.employees}</td>
                        <td className="text-right">{formatCurrency(dept.gross)}</td>
                        <td className="text-right">{formatCurrency(dept.net)}</td>
                        <td className="text-right">{formatCurrency(dept.paye)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Monthly Trend */}
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Monthly Payroll Trend</h3>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Period</th>
                      <th className="text-right">Gross</th>
                      <th className="text-right">Net</th>
                      <th className="text-right">PAYE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboardData?.charts.monthlyTrend.slice(-6).map((month) => (
                      <tr key={month.period}>
                        <td className="font-medium">{month.period}</td>
                        <td className="text-right">{formatCurrency(month.gross)}</td>
                        <td className="text-right">{formatCurrency(month.net)}</td>
                        <td className="text-right">{formatCurrency(month.paye)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Link href="/employees" className="p-4 border border-gray-200 rounded-xl hover:border-primary hover:bg-primary/5 transition-colors group">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-blue-100 rounded-xl group-hover:bg-blue-200 transition-colors">
                    <UserPlus className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Add Employee</p>
                    <p className="text-sm text-gray-500">Create new employee record</p>
                  </div>
                </div>
              </Link>
              <Link href="/payroll" className="p-4 border border-gray-200 rounded-xl hover:border-primary hover:bg-primary/5 transition-colors group">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-green-100 rounded-xl group-hover:bg-green-200 transition-colors">
                    <Calculator className="h-6 w-6 text-green-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Run Payroll</p>
                    <p className="text-sm text-gray-500">Process payroll for current period</p>
                  </div>
                </div>
              </Link>
              <Link href="/payslips" className="p-4 border border-gray-200 rounded-xl hover:border-primary hover:bg-primary/5 transition-colors group">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-purple-100 rounded-xl group-hover:bg-purple-200 transition-colors">
                    <FileText className="h-6 w-6 text-purple-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Generate Payslips</p>
                    <p className="text-sm text-gray-500">Create and export payslips</p>
                  </div>
                </div>
              </Link>
              <Link href="/reports" className="p-4 border border-gray-200 rounded-xl hover:border-primary hover:bg-primary/5 transition-colors group">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-orange-100 rounded-xl group-hover:bg-orange-200 transition-colors">
                    <ClipboardList className="h-6 w-6 text-orange-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">View Reports</p>
                    <p className="text-sm text-gray-500">Generate payroll reports</p>
                  </div>
                </div>
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}