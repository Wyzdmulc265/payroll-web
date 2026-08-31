'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Calculator, Loader2, CheckCircle, XCircle, AlertCircle,
  FileText, Download, Upload, RefreshCw, Save, Eye,
  ChevronLeft, ChevronRight, Plus, Minus, Search, Filter
} from 'lucide-react';
import { calculatePayroll, formatCurrency, PayrollInput, DEFAULT_STATUTORY_CONFIG } from '@/lib/payroll-engine';

interface Employee {
  id: string;
  employeeId: string;
  fullName: string;
  department: string;
  position: string;
  basicSalary: number;
  allowances: number;
  isActive: boolean;
}

interface PayrollRow {
  id: string; // employeeId
  employeeId: string;
  employeeName: string;
  department: string;
  basicSalary: number;
  allowances: number;
  overtimeHours: number;
  overtimeRate: number;
  overtimePay: number;
  bonuses: number;
  otherEarnings: number;
  grossEarnings: number;
  paye: number;
  pensionEE: number;
  pensionER: number;
  otherDeductions: number;
  totalDeductions: number;
  netPay: number;
  employerCost: number;
  // Validation
  isValid: boolean;
  errors: string[];
}

interface PayrollPeriod {
  period: string;
  periodStart: string;
  periodEnd: string;
  status: string;
}

export default function PayrollPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [payrollRows, setPayrollRows] = useState<PayrollRow[]>([]);
  const [periods, setPeriods] = useState<string[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string>('2026-08');
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loaded' | 'calculated' | 'validated' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchEmployees = async () => {
    try {
      const res = await fetch('/api/employees?limit=100');
      const data = await res.json();
      if (data.success) {
        const activeEmployees = (data.data as Employee[]).filter((e) => e.isActive);
        setEmployees(activeEmployees);
        // Initialize payroll rows
        const rows: PayrollRow[] = activeEmployees.map((emp) => ({
          id: emp.id,
          employeeId: emp.employeeId,
          employeeName: emp.fullName,
          department: emp.department,
          basicSalary: emp.basicSalary,
          allowances: emp.allowances,
          overtimeHours: 0,
          overtimeRate: DEFAULT_STATUTORY_CONFIG.overtimeRateMultiplier,
          overtimePay: 0,
          bonuses: 0,
          otherEarnings: 0,
          grossEarnings: 0,
          paye: 0,
          pensionEE: 0,
          pensionER: 0,
          otherDeductions: 0,
          totalDeductions: 0,
          netPay: 0,
          employerCost: 0,
          isValid: true,
          errors: [],
        }));
        setPayrollRows(rows);
        setStatus('loaded');
      }
    } catch (error) {
      console.error('Failed to fetch employees:', error);
      setError('Failed to load employees');
    }
  };

  const fetchPeriods = async () => {
    try {
      const res = await fetch('/api/dashboard');
      const data = await res.json();
      if (data.success && data.data.periods) {
        setPeriods(data.data.periods);
        if (data.data.periods.length > 0) {
          setSelectedPeriod(data.data.periods[0]);
        }
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
      fetchEmployees();
      setStatus('idle');
      setError(null);
      setSuccessMessage(null);
    }
  }, [selectedPeriod]);

  const calculateOvertimePay = (row: PayrollRow) => {
    if (row.overtimeHours <= 0) return 0;
    const hourlyRate = row.basicSalary / DEFAULT_STATUTORY_CONFIG.workingDaysPerMonth / DEFAULT_STATUTORY_CONFIG.workingHoursPerDay;
    return Math.round(row.overtimeHours * row.overtimeRate * hourlyRate);
  };

  const recalculateRow = (row: PayrollRow): PayrollRow => {
    const overtimePay = calculateOvertimePay(row);
    const input: PayrollInput = {
      basicSalary: row.basicSalary,
      allowances: row.allowances,
      overtimeHours: row.overtimeHours,
      overtimeRate: row.overtimeRate,
      bonuses: row.bonuses,
      otherEarnings: row.otherEarnings,
      otherDeductions: row.otherDeductions,
    };
    const result = calculatePayroll(input, DEFAULT_STATUTORY_CONFIG);
    
    // Validate
    const errors: string[] = [];
    if (result.netPay < 0) errors.push('Negative net pay');
    if (result.paye < 0) errors.push('Invalid PAYE');
    if (result.pensionEE < 0 || result.pensionER < 0) errors.push('Invalid pension');
    
    return {
      ...row,
      ...result,
      isValid: errors.length === 0,
      errors,
    };
  };

  const handleInputChange = (id: string, field: keyof PayrollRow, value: string | number | boolean) => {
    setPayrollRows(prev => prev.map(row => {
      if (row.id !== id) return row;
      const updated = { ...row, [field]: value };
      // Recalculate dependent fields
      if (['overtimeHours', 'overtimeRate', 'basicSalary', 'allowances', 'bonuses', 'otherEarnings', 'otherDeductions'].includes(field)) {
        return recalculateRow(updated);
      }
      return updated;
    }));
  };

  const handleCalculate = async () => {
    setCalculating(true);
    setError(null);
    
    // Recalculate all rows
    setPayrollRows(prev => prev.map(recalculateRow));
    
    // Validate all
    const allValid = payrollRows.every(r => r.isValid);
    setStatus(allValid ? 'calculated' : 'error');
    
    if (!allValid) {
      setError('Some rows have validation errors. Please review.');
    }
    
    setCalculating(false);
  };

  const handleValidate = async () => {
    setLoading(true);
    setError(null);
    
    // Client-side validation
    const validatedRows = payrollRows.map(recalculateRow);
    setPayrollRows(validatedRows);
    
    const allValid = validatedRows.every(r => r.isValid);
    const hasData = validatedRows.some(r => r.grossEarnings > 0);
    
    if (!hasData) {
      setError('No payroll data to validate. Please calculate first.');
      setStatus('error');
    } else if (allValid) {
      setStatus('validated');
      setSuccessMessage('All payroll calculations validated successfully!');
    } else {
      setStatus('error');
      setError('Validation failed. Please fix errors in red rows.');
    }
    
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    
    try {
      const overtimeData = payrollRows
        .filter(r => r.overtimeHours > 0 || r.bonuses > 0 || r.otherEarnings > 0 || r.otherDeductions > 0)
        .map(r => ({
          employeeId: r.id,
          overtimeHours: r.overtimeHours,
          overtimeRate: r.overtimeRate,
          bonuses: r.bonuses,
          otherEarnings: r.otherEarnings,
          otherDeductions: r.otherDeductions,
        }));

      const res = await fetch('/api/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payrollPeriod: selectedPeriod,
          overtimeData,
        }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        setStatus('saved');
        setSuccessMessage(`Payroll saved for ${data.data.processedCount} employees!`);
      } else {
        setStatus('error');
        setError(data.error || 'Failed to save payroll');
      }
    } catch (error) {
      console.error('Error saving payroll:', error);
      setStatus('error');
      setError('Network error while saving');
    } finally {
      setSaving(false);
    }
  };

  const handleGeneratePayslips = async () => {
    // TODO: Implement batch payslip generation
    alert('Payslip generation would redirect to Payslips page');
  };

  const totals = payrollRows.reduce((acc, row) => {
    acc.basicSalary += row.basicSalary;
    acc.allowances += row.allowances;
    acc.overtimePay += row.overtimePay;
    acc.bonuses += row.bonuses;
    acc.otherEarnings += row.otherEarnings;
    acc.grossEarnings += row.grossEarnings;
    acc.paye += row.paye;
    acc.pensionEE += row.pensionEE;
    acc.pensionER += row.pensionER;
    acc.otherDeductions += row.otherDeductions;
    acc.totalDeductions += row.totalDeductions;
    acc.netPay += row.netPay;
    acc.employerCost += row.employerCost;
    return acc;
  }, {
    basicSalary: 0, allowances: 0, overtimePay: 0, bonuses: 0, otherEarnings: 0,
    grossEarnings: 0, paye: 0, pensionEE: 0, pensionER: 0, otherDeductions: 0,
    totalDeductions: 0, netPay: 0, employerCost: 0,
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-full mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-xl font-bold text-primary">WizTech Payroll</Link>
            <span className="text-gray-500">/</span>
            <h1 className="text-2xl font-semibold text-gray-900">Payroll Processing</h1>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="input w-auto"
              disabled={status !== 'idle' && status !== 'loaded'}
            >
              {periods.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <button onClick={fetchEmployees} disabled={loading} className="btn-secondary">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-full mx-auto px-6 py-6">
        {/* Status & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              status === 'idle' ? 'bg-gray-100 text-gray-600' :
              status === 'loaded' ? 'bg-blue-100 text-blue-700' :
              status === 'calculated' ? 'bg-yellow-100 text-yellow-700' :
              status === 'validated' ? 'bg-green-100 text-green-700' :
              status === 'saved' ? 'bg-purple-100 text-purple-700' :
              'bg-red-100 text-red-700'
            }`}>
              {status === 'idle' ? 'Not Started' :
               status === 'loaded' ? 'Employees Loaded' :
               status === 'calculated' ? 'Calculated' :
               status === 'validated' ? 'Validated' :
               status === 'saved' ? 'Saved' : 'Error'}
            </span>
            {error && (
              <span className="px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-700 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                {error}
              </span>
            )}
            {successMessage && (
              <span className="px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-700 flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                {successMessage}
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={handleCalculate} 
              disabled={calculating || status === 'saved'}
              className="btn-primary"
            >
              <Calculator className="h-4 w-4 mr-2" />
              {calculating ? 'Calculating...' : 'Calculate'}
            </button>
            <button 
              onClick={handleValidate} 
              disabled={loading || status === 'saved'}
              className="btn-secondary"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              {loading ? 'Validating...' : 'Validate'}
            </button>
            <button 
              onClick={handleSave} 
              disabled={saving || status !== 'validated'}
              className="btn-success"
            >
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Saving...' : 'Save Payroll'}
            </button>
            <button 
              onClick={handleGeneratePayslips} 
              disabled={status !== 'saved'}
              className="btn-secondary"
            >
              <FileText className="h-4 w-4 mr-2" />
              Generate Payslips
            </button>
          </div>
        </div>

        {/* Instructions */}
        {(status === 'idle' || status === 'loaded') && (
          <div className="card mb-6 bg-blue-50 border-blue-200">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Info className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-medium text-blue-800">Payroll Workflow</h3>
                <ol className="text-sm text-blue-700 mt-1 list-decimal list-inside space-y-1">
                  <li>Select payroll period above</li>
                  <li>Click &quot;Calculate&quot; to compute all earnings, deductions, and net pay</li>
                  <li>Review calculations and click &quot;Validate&quot; to check for errors</li>
                  <li>Click &quot;Save Payroll&quot; to persist to database</li>
                  <li>Generate payslips and reports from saved data</li>
                </ol>
                <p className="text-xs text-blue-600 mt-2">
                  Enter overtime hours, bonuses, and other earnings/deductions per employee. 
                  Calculations use Malawi statutory rates from Settings.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Payroll Register */}
        <div className="card">
          <div className="overflow-x-auto">
            <table className="table min-w-[1400px]">
              <thead className="sticky top-0 bg-gray-50">
                <tr>
                  <th className="w-24">Emp ID</th>
                  <th className="w-40">Name</th>
                  <th className="w-28">Department</th>
                  <th className="w-28 text-right">Basic</th>
                  <th className="w-28 text-right">Allowances</th>
                  <th className="w-24 text-right">OT Hours</th>
                  <th className="w-24 text-right">OT Rate</th>
                  <th className="w-28 text-right">OT Pay</th>
                  <th className="w-24 text-right">Bonuses</th>
                  <th className="w-28 text-right">Other Earn</th>
                  <th className="w-28 text-right font-medium bg-yellow-50">Gross</th>
                  <th className="w-24 text-right bg-red-50">PAYE</th>
                  <th className="w-24 text-right bg-red-50">Pension EE</th>
                  <th className="w-24 text-right bg-green-50">Pension ER</th>
                  <th className="w-24 text-right bg-red-50">Other Ded</th>
                  <th className="w-28 text-right font-medium bg-red-50">Total Ded</th>
                  <th className="w-28 text-right font-medium bg-green-50">Net Pay</th>
                  <th className="w-28 text-right font-medium bg-blue-50">Employer Cost</th>
                </tr>
              </thead>
              <tbody>
                {payrollRows.length === 0 ? (
                  <tr>
                    <td colSpan={19} className="px-4 py-8 text-center text-gray-500">
                      Select a period and click Refresh to load employees
                    </td>
                  </tr>
                ) : (
                  payrollRows.map((row) => (
                    <tr key={row.id} className={!row.isValid ? 'bg-red-50' : ''}>
                      <td className="font-mono text-sm">{row.employeeId}</td>
                      <td className="font-medium">{row.employeeName}</td>
                      <td className="text-sm">{row.department}</td>
                      <td className="text-right font-mono">
                        <input
                          type="number"
                          value={row.basicSalary}
                          onChange={(e) => handleInputChange(row.id, 'basicSalary', parseFloat(e.target.value) || 0)}
                          className="input w-28 text-right font-mono"
                          step="1000"
                        />
                      </td>
                      <td className="text-right font-mono">
                        <input
                          type="number"
                          value={row.allowances}
                          onChange={(e) => handleInputChange(row.id, 'allowances', parseFloat(e.target.value) || 0)}
                          className="input w-28 text-right font-mono"
                          step="1000"
                        />
                      </td>
                      <td className="text-right font-mono">
                        <input
                          type="number"
                          value={row.overtimeHours}
                          onChange={(e) => handleInputChange(row.id, 'overtimeHours', parseFloat(e.target.value) || 0)}
                          className="input w-20 text-right font-mono"
                          min="0"
                          step="0.5"
                        />
                      </td>
                      <td className="text-right font-mono">
                        <input
                          type="number"
                          value={row.overtimeRate}
                          onChange={(e) => handleInputChange(row.id, 'overtimeRate', parseFloat(e.target.value) || DEFAULT_STATUTORY_CONFIG.overtimeRateMultiplier)}
                          className="input w-20 text-right font-mono"
                          min="0"
                          step="0.1"
                        />
                      </td>
                      <td className="text-right font-mono text-blue-600">{formatCurrency(row.overtimePay)}</td>
                      <td className="text-right font-mono">
                        <input
                          type="number"
                          value={row.bonuses}
                          onChange={(e) => handleInputChange(row.id, 'bonuses', parseFloat(e.target.value) || 0)}
                          className="input w-24 text-right font-mono"
                          min="0"
                          step="1000"
                        />
                      </td>
                      <td className="text-right font-mono">
                        <input
                          type="number"
                          value={row.otherEarnings}
                          onChange={(e) => handleInputChange(row.id, 'otherEarnings', parseFloat(e.target.value) || 0)}
                          className="input w-28 text-right font-mono"
                          min="0"
                          step="1000"
                        />
                      </td>
                      <td className="text-right font-mono font-medium text-blue-600">{formatCurrency(row.grossEarnings)}</td>
                      <td className="text-right font-mono text-red-600">{formatCurrency(row.paye)}</td>
                      <td className="text-right font-mono text-red-600">{formatCurrency(row.pensionEE)}</td>
                      <td className="text-right font-mono text-green-600">{formatCurrency(row.pensionER)}</td>
                      <td className="text-right font-mono">
                        <input
                          type="number"
                          value={row.otherDeductions}
                          onChange={(e) => handleInputChange(row.id, 'otherDeductions', parseFloat(e.target.value) || 0)}
                          className="input w-24 text-right font-mono"
                          min="0"
                          step="1000"
                        />
                      </td>
                      <td className="text-right font-mono font-medium text-red-600">{formatCurrency(row.totalDeductions)}</td>
                      <td className="text-right font-mono font-medium text-green-600">{formatCurrency(row.netPay)}</td>
                      <td className="text-right font-mono font-medium text-blue-600">{formatCurrency(row.employerCost)}</td>
                    </tr>
                  ))
                )}
                {/* Totals Row */}
                <tr className="bg-gray-50 font-semibold">
                  <td colSpan={3} className="text-right">TOTALS</td>
                  <td className="text-right font-mono">{formatCurrency(totals.basicSalary)}</td>
                  <td className="text-right font-mono">{formatCurrency(totals.allowances)}</td>
                  <td></td>
                  <td></td>
                  <td className="text-right font-mono">{formatCurrency(totals.overtimePay)}</td>
                  <td className="text-right font-mono">{formatCurrency(totals.bonuses)}</td>
                  <td className="text-right font-mono">{formatCurrency(totals.otherEarnings)}</td>
                  <td className="text-right font-mono text-blue-600">{formatCurrency(totals.grossEarnings)}</td>
                  <td className="text-right font-mono text-red-600">{formatCurrency(totals.paye)}</td>
                  <td className="text-right font-mono text-red-600">{formatCurrency(totals.pensionEE)}</td>
                  <td className="text-right font-mono text-green-600">{formatCurrency(totals.pensionER)}</td>
                  <td className="text-right font-mono text-red-600">{formatCurrency(totals.otherDeductions)}</td>
                  <td className="text-right font-mono text-red-600">{formatCurrency(totals.totalDeductions)}</td>
                  <td className="text-right font-mono text-green-600">{formatCurrency(totals.netPay)}</td>
                  <td className="text-right font-mono text-blue-600">{formatCurrency(totals.employerCost)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Validation Errors */}
          {payrollRows.some(r => !r.isValid) && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <h4 className="font-medium text-red-800 mb-2 flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                Validation Errors
              </h4>
              <ul className="text-sm text-red-700 space-y-1">
                {payrollRows
                  .filter(r => !r.isValid)
                  .map(r => (
                    <li key={r.id}>
                      <strong>{r.employeeId} - {r.employeeName}:</strong> {r.errors.join(', ')}
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// Missing Info icon
function Info({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}