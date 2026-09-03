'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Users, DollarSign, CreditCard, Banknote,
  Building, Building2, Loader2, RefreshCw,
  BarChart3, LineChart as LineChartIcon, PieChart as PieChartIcon
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area
} from 'recharts';
import { formatCurrency } from '@/lib/payroll-engine';

interface DashboardData {
  period: string;
  currency: string;
  kpis: {
    activeEmployees: number;
    grossPayroll: number;
    totalDeductions: number;
    netPayroll: number;
    paye: number;
    pensionEE: number;
    pensionER: number;
    fbt: number;
    employerCost: number;
    formatted: {
      grossPayroll: string;
      totalDeductions: string;
      netPayroll: string;
      paye: string;
      pensionEE: string;
      pensionER: string;
      fbt: string;
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
      pensionEE: number;
      pensionER: number;
      fbt: number;
      employerCost: number;
    }>;
    monthlyTrend: Array<{
      period: string;
      gross: number;
      net: number;
      paye: number;
      fbt: number;
    }>;
    headcountTrend: Array<{
      period: string;
      count: number;
    }>;
  };
}

const COLORS = ['#1e40af', '#059669', '#dc2626', '#d97706', '#7c3aed', '#0891b2', '#be185d', '#65a30d'];

export default function DashboardPage() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [periods, setPeriods] = useState<string[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const currentYear = new Date().getFullYear();
  const suggestedPeriod = `${currentYear}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

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
        setSelectedPeriod((prev) => prev || data.data.periods[0] || suggestedPeriod);
      }
    } catch (error) {
      console.error('Failed to fetch periods:', error);
    }
  };

  useEffect(() => {
    // Initial data load: setLoading fires synchronously inside the fetch helper by design.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPeriods();
  }, []);

  useEffect(() => {
    if (selectedPeriod) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchDashboard();
    }
  }, [selectedPeriod]);

  const kpiCards = [
    { 
      label: 'Active Employees', 
      value: dashboardData?.kpis.activeEmployees?.toString() || '0', 
      icon: Users, 
      color: 'bg-blue-500', 
      iconColor: 'text-blue-600',
      bgColor: 'bg-blue-100'
    },
    { 
      label: 'Gross Payroll', 
      value: dashboardData?.kpis.formatted.grossPayroll || 'MWK 0.00', 
      icon: DollarSign, 
      color: 'bg-green-500', 
      iconColor: 'text-green-600',
      bgColor: 'bg-green-100'
    },
    { 
      label: 'Total Deductions', 
      value: dashboardData?.kpis.formatted.totalDeductions || 'MWK 0.00', 
      icon: CreditCard, 
      color: 'bg-red-500', 
      iconColor: 'text-red-600',
      bgColor: 'bg-red-100'
    },
    { 
      label: 'Net Payroll', 
      value: dashboardData?.kpis.formatted.netPayroll || 'MWK 0.00', 
      icon: Banknote, 
      color: 'bg-purple-500', 
      iconColor: 'text-purple-600',
      bgColor: 'bg-purple-100'
    },
    { 
      label: 'PAYE', 
      value: dashboardData?.kpis.formatted.paye || 'MWK 0.00', 
      icon: Building, 
      color: 'bg-orange-500', 
      iconColor: 'text-orange-600',
      bgColor: 'bg-orange-100'
    },
    { 
      label: 'Employer Cost', 
      value: dashboardData?.kpis.formatted.employerCost || 'MWK 0.00', 
      icon: Building2, 
      color: 'bg-indigo-500', 
      iconColor: 'text-indigo-600',
      bgColor: 'bg-indigo-100'
    },
    { 
      label: 'Total FBT', 
      value: dashboardData?.kpis.formatted.fbt || 'MWK 0.00', 
      icon: CreditCard, 
      color: 'bg-amber-500', 
      iconColor: 'text-amber-600',
      bgColor: 'bg-amber-100'
    },
  ];

  if (loading && !dashboardData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const formatCompact = (value: number) => {
    if (value >= 1e9) return `MWK ${(value / 1e9).toFixed(1)}B`;
    if (value >= 1e6) return `MWK ${(value / 1e6).toFixed(1)}M`;
    if (value >= 1e3) return `MWK ${(value / 1e3).toFixed(1)}K`;
    return `MWK ${value.toFixed(0)}`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-xl font-bold text-primary">WizTech Payroll</Link>
            <span className="text-gray-500">/</span>
            <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-600" htmlFor="dashboard-period">Period</label>
            <select
              id="dashboard-period"
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="input w-auto"
            >
              {selectedPeriod && !periods.includes(selectedPeriod) && (
                <option value={selectedPeriod}>{selectedPeriod}</option>
              )}
              {periods.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <input
              type="month"
              aria-label="Pick a period (YYYY-MM)"
              title="Pick a period (YYYY-MM)"
              value={selectedPeriod}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                setSelectedPeriod(v);
                setPeriods((prev) => (prev.includes(v) ? prev : [v, ...prev]));
              }}
              className="input w-auto"
            />
            <button onClick={fetchDashboard} disabled={loading} aria-label="Refresh dashboard" title="Refresh" className="btn-secondary">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {kpiCards.map((kpi) => (
            <div key={kpi.label} className="card hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <p className="text-sm text-gray-500 truncate">{kpi.label}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1 truncate">{kpi.value}</p>
                </div>
                <div className={`p-3 rounded-xl ${kpi.bgColor} flex-shrink-0`}>
                  <kpi.icon className={`h-6 w-6 ${kpi.iconColor}`} />
                </div>
              </div>
            </div>
          ))}

        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Payroll by Department - Bar Chart */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  Payroll by Department
                </h3>
                <span className="text-sm text-gray-500">
                  {dashboardData?.charts.payrollByDepartment?.length || 0} departments
                </span>
              </div>
              <div className="h-72">
                {dashboardData?.charts.payrollByDepartment && dashboardData.charts.payrollByDepartment.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dashboardData.charts.payrollByDepartment} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis type="number" tickFormatter={formatCompact} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="department" width={100} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value: number) => [formatCurrency(value), '']} />
                      <Legend />
                       <Bar dataKey="gross" name="Gross Payroll" fill="#1e40af" radius={[0, 4, 4, 0]} />
                       <Bar dataKey="net" name="Net Payroll" fill="#059669" radius={[0, 4, 4, 0]} />
                       <Bar dataKey="paye" name="PAYE" fill="#dc2626" radius={[0, 4, 4, 0]} />
                       <Bar dataKey="fbt" name="FBT" fill="#d97706" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-400">
                    No data available for this period
                  </div>
                )}
              </div>
            </div>

            {/* Monthly Trend - Area Chart */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <LineChartIcon className="h-5 w-5 text-primary" />
                  Monthly Payroll Trend
                </h3>
                <span className="text-sm text-gray-500">
                  Last 6 months
                </span>
              </div>
              <div className="h-72">
                {dashboardData?.charts.monthlyTrend && dashboardData.charts.monthlyTrend.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dashboardData.charts.monthlyTrend.slice(-6)}>
                       <defs>
                         <linearGradient id="colorGross" x1="0" y1="0" x2="0" y2="1">
                           <stop offset="5%" stopColor="#1e40af" stopOpacity={0.3}/>
                           <stop offset="95%" stopColor="#1e40af" stopOpacity={0}/>
                         </linearGradient>
                         <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
                           <stop offset="5%" stopColor="#059669" stopOpacity={0.3}/>
                           <stop offset="95%" stopColor="#059669" stopOpacity={0}/>
                         </linearGradient>
                         <linearGradient id="colorPaye" x1="0" y1="0" x2="0" y2="1">
                           <stop offset="5%" stopColor="#dc2626" stopOpacity={0.3}/>
                           <stop offset="95%" stopColor="#dc2626" stopOpacity={0}/>
                         </linearGradient>
                         <linearGradient id="colorFbt" x1="0" y1="0" x2="0" y2="1">
                           <stop offset="5%" stopColor="#d97706" stopOpacity={0.3}/>
                           <stop offset="95%" stopColor="#d97706" stopOpacity={0}/>
                         </linearGradient>
                       </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={formatCompact} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value: number) => [formatCurrency(value), '']} />
                      <Legend />
                       <Area type="monotone" dataKey="gross" name="Gross" stroke="#1e40af" fillOpacity={1} fill="url(#colorGross)" />
                       <Area type="monotone" dataKey="net" name="Net" stroke="#059669" fillOpacity={1} fill="url(#colorNet)" />
                       <Area type="monotone" dataKey="paye" name="PAYE" stroke="#dc2626" fillOpacity={1} fill="url(#colorPaye)" />
                       <Area type="monotone" dataKey="fbt" name="FBT" stroke="#d97706" fillOpacity={1} fill="url(#colorFbt)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-400">
                    No trend data available
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Charts Row 2 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Department Distribution - Pie Chart */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <PieChartIcon className="h-5 w-5 text-primary" />
                  Gross Payroll Distribution
                </h3>
              </div>
              <div className="h-72 flex items-center justify-center">
                {dashboardData?.charts.payrollByDepartment && dashboardData.charts.payrollByDepartment.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={dashboardData.charts.payrollByDepartment}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="gross"
                        nameKey="department"
                        label={({ department, percent }) => `${department}: ${(percent * 100).toFixed(1)}%`}
                        labelLine={false}
                      >
                        {dashboardData.charts.payrollByDepartment.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => [formatCurrency(value), '']} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-gray-400">No data available</div>
                )}
              </div>
            </div>

            {/* Headcount Trend - Line Chart */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  Employee Headcount Trend
                </h3>
              </div>
              <div className="h-72">
                {dashboardData != null && dashboardData.charts.headcountTrend.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dashboardData.charts.headcountTrend.slice(-12)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value: number) => [value.toString(), 'Employees']} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="count"
                        name="Active Employees"
                        stroke="#7c3aed"
                        strokeWidth={3}
                        dot={{ r: 5, strokeWidth: 2 }}
                        activeDot={{ r: 8, strokeWidth: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-400">
                    No headcount data available
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Summary Table */}
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Department Summary</h3>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Department</th>
                    <th className="text-right">Employees</th>
                    <th className="text-right">Gross Payroll</th>
                    <th className="text-right">Net Payroll</th>
                    <th className="text-right">PAYE</th>
                    <th className="text-right">Pension (EE)</th>
                    <th className="text-right">Pension (ER)</th>
                    <th className="text-right">FBT</th>
                    <th className="text-right">Employer Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboardData?.charts.payrollByDepartment.map((dept, index) => (
                    <tr key={dept.department}>
                      <td className="font-medium">
                        <span className="inline-block w-3 h-3 rounded-full mr-2" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                        {dept.department}
                      </td>
                      <td className="text-right">{dept.employees}</td>
                      <td className="text-right font-mono">{formatCurrency(dept.gross)}</td>
                      <td className="text-right font-mono">{formatCurrency(dept.net)}</td>
                      <td className="text-right font-mono text-red-600">{formatCurrency(dept.paye)}</td>
                      <td className="text-right font-mono">{formatCurrency(dept.pensionEE)}</td>
                      <td className="text-right font-mono">{formatCurrency(dept.pensionER)}</td>
                      <td className="text-right font-mono text-amber-600">{formatCurrency(dept.fbt)}</td>
                      <td className="text-right font-mono text-blue-600">{formatCurrency(dept.employerCost)}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-semibold">
                    <td>TOTAL</td>
                    <td className="text-right">{dashboardData?.kpis.activeEmployees || 0}</td>
                    <td className="text-right font-mono">{dashboardData?.kpis.formatted.grossPayroll || 'MWK 0.00'}</td>
                    <td className="text-right font-mono">{dashboardData?.kpis.formatted.netPayroll || 'MWK 0.00'}</td>
                    <td className="text-right font-mono text-red-600">{dashboardData?.kpis.formatted.paye || 'MWK 0.00'}</td>
                    <td className="text-right font-mono">{dashboardData?.kpis.formatted.pensionEE || 'MWK 0.00'}</td>
                    <td className="text-right font-mono">{dashboardData?.kpis.formatted.pensionER || 'MWK 0.00'}</td>
                    <td className="text-right font-mono text-amber-600">{dashboardData?.kpis.formatted.fbt || 'MWK 0.00'}</td>
                    <td className="text-right font-mono text-blue-600">{dashboardData?.kpis.formatted.employerCost || 'MWK 0.00'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
      </main>
    </div>
  );
}