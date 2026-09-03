'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Loader2, Table, Download as DownloadIcon
} from 'lucide-react';
import { escapeCsvCell, csvField } from '@/lib/csv';

const REPORT_TYPES = [
  'Payroll Register',
  'Payroll Summary',
  'Statutory Summary',
  'Department Payroll',
  'Bank Payment Schedule',
  'Employee Earnings History',
] as const;

type ReportType = typeof REPORT_TYPES[number];

interface ReportData {
  type: string;
  period: string;
  department: string;
  headers: string[];
  rows: string[][];
  generatedAt: string;
}

export default function ReportsPage() {
  const [reportType, setReportType] = useState<ReportType>('Payroll Register');
  const [periods, setPeriods] = useState<string[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string>('');
  const [departments, setDepartments] = useState<string[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState<string>('All');
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentYear = new Date().getFullYear();
  const suggestedPeriod = `${currentYear}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

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

  const fetchDepartments = async () => {
    try {
      const res = await fetch('/api/employees?limit=200');
      const data = await res.json();
      if (data.success) {
        const depts = ['All', ...new Set((data.data as Array<{ department: string }>).map((e) => e.department))].sort();
        setDepartments(depts);
      }
    } catch (error) {
      console.error('Failed to fetch departments:', error);
    }
  };

  useEffect(() => {
    // Initial data load: setLoading fires synchronously inside the fetch helper by design.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPeriods();
    fetchDepartments();
  }, []);

  const generateReport = async () => {
    if (!selectedPeriod) {
      setError('Please select a period');
      return;
    }

    setLoading(true);
    setError(null);
    setReportData(null);

    try {
      const params = new URLSearchParams({
        type: reportType,
        period: selectedPeriod,
        department: selectedDepartment,
      });

      if (reportType === 'Employee Earnings History' && selectedDepartment === 'All') {
        setError('Please select a department/employee for Earnings History');
        setLoading(false);
        return;
      }

      const res = await fetch(`/api/reports?${params}`);
      const data = await res.json();

      if (data.success) {
        setReportData(data.data);
      } else {
        setError(data.error || 'Failed to generate report');
      }
    } catch (error) {
      console.error('Error generating report:', error);
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    if (!reportData) return;

    const csvContent = [
      reportData.headers.map(csvField).join(','),
      ...reportData.rows.map(row => row.map(cell => csvField(escapeCsvCell(cell))).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${reportData.type.replace(/\s+/g, '_')}_${reportData.period}_${reportData.department}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const exportToExcel = () => {
    if (!reportData) return;

    const html = `
      <html>
        <head>
          <meta charset="utf-8">
        </head>
        <body>
          <table border="1">
            <thead>
              <tr>${reportData.headers.map(h => `<th>${escapeCsvCell(h)}</th>`).join('')}</tr>
            </thead>
            <tbody>
              ${reportData.rows.map(r => `<tr>${r.map(c => `<td>${escapeCsvCell(c)}</td>`).join('')}</tr>`).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;

    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${reportData.type.replace(/\s+/g, '_')}_${reportData.period}_${reportData.department}.xls`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-xl font-bold text-primary">WizTech Payroll</Link>
            <span className="text-gray-500">/</span>
            <h1 className="text-2xl font-semibold text-gray-900">Reports</h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* Report Generator */}
        <div className="card mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Report Generator</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="label">Report Type *</label>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value as ReportType)}
                className="input"
              >
                {REPORT_TYPES.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Period *</label>
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="input"
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
                aria-label="Pick a new period (YYYY-MM)"
                title="Pick a new period (YYYY-MM)"
                value={selectedPeriod}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  setSelectedPeriod(v);
                  setPeriods((prev) => (prev.includes(v) ? prev : [v, ...prev]));
                }}
                className="input mt-2"
              />
            </div>
            <div>
              <label className="label">Department</label>
              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="input"
              >
                {departments.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button 
                onClick={generateReport} 
                disabled={loading || !selectedPeriod}
                className="btn-primary w-full"
              >
                <Loader2 className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'Generating...' : 'Generate Report'}
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          {/* Export Buttons */}
          {reportData && (
            <div className="flex items-center gap-3 mt-4 pt-4 border-t border-gray-200">
              <button onClick={exportToCSV} className="btn-secondary">
                <DownloadIcon className="h-4 w-4 mr-2" />
                Export CSV
              </button>
              <button onClick={exportToExcel} className="btn-secondary">
                <Table className="h-4 w-4 mr-2" />
                Export Excel
              </button>
              <span className="text-sm text-gray-500 ml-auto">
                Generated: {new Date(reportData.generatedAt).toLocaleString()}
              </span>
            </div>
          )}
        </div>

        {/* Report Output */}
        {reportData && (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                {reportData.type} - {reportData.period} - {reportData.department}
              </h2>
              <span className="badge badge-info">{reportData.rows.length} rows</span>
            </div>

            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    {reportData.headers.map((header, i) => (
                      <th key={i}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reportData.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        <td 
                          key={cellIndex} 
                          className={cellIndex >= 4 ? 'font-mono text-right' : ''}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Help Text */}
        {!reportData && (
          <div className="card bg-blue-50 border-blue-200">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Info className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-medium text-blue-800">Available Reports</h3>
                <ul className="text-sm text-blue-700 mt-2 list-disc list-inside space-y-1">
                  <li><strong>Payroll Register</strong> - Detailed payroll for all employees in period</li>
                  <li><strong>Payroll Summary</strong> - Aggregated totals by department</li>
                  <li><strong>Statutory Summary</strong> - PAYE, Pension, TEVET totals for compliance</li>
                  <li><strong>Department Payroll</strong> - Breakdown by department</li>
                  <li><strong>Bank Payment Schedule</strong> - Net pay by bank for payment processing</li>
                  <li><strong>Employee Earnings History</strong> - Historical earnings for selected employee</li>
                </ul>
                <p className="text-xs text-blue-600 mt-2">
                  Select report type, period, and department, then click Generate Report.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function Info({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function AlertCircle({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}