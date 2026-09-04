'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Download, Printer, Loader2,
  ChevronLeft, AlertCircle
} from 'lucide-react';
import { formatCurrency } from '@/lib/payroll-engine';
import { PeriodPicker } from '@/components/PeriodPicker';

interface PayslipData {
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  companyTPIN: string;
  pensionFund: string;
  payrollPeriod: string;
  periodStart: string;
  periodEnd: string;
  employeeId: string;
  fullName: string;
  nationalId: string | null;
  department: string;
  position: string;
  employmentDate: string;
  bankName: string | null;
  accountNumber: string | null;
  paymentMethod: string;
  taxStatus: string;
  basicSalary: number;
  allowances: number;
  overtimePay: number;
  bonuses: number;
  otherEarnings: number;
  grossEarnings: number;
  paye: number;
  pensionEE: number;
  otherDeductions: number;
  totalDeductions: number;
  netPay: number;
  pensionER: number;
  tevetLevy: number;
  fringeBenefitBase: number;
  fringeBenefitTax: number;
  fbtSummary: {
    totalTaxableValue: number;
    fbtRate: number;
    fringeBenefitsTax: number;
    benefits: Array<{
      type: string;
      classification: string;
      selectedTaxableValue: number;
      ruleUsed: string;
      auditTrail: unknown[];
    }>;
  } | null;
  employerCost: number;
  formatted: Record<string, string>;
}

interface Employee {
  id: string;
  employeeId: string;
  fullName: string;
  department: string;
  isActive: boolean;
}

export default function PayslipsPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string>('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [payslip, setPayslip] = useState<PayslipData | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEmployees = async () => {
    try {
      const res = await fetch('/api/employees?limit=200');
      const data = await res.json();
      if (data.success) {
        setEmployees(data.data.filter((e: Employee) => e.isActive));
      }
    } catch (error) {
      console.error('Failed to fetch employees:', error);
    }
  };

  useEffect(() => {
    // Initial data load: setLoading fires synchronously inside the fetch helper by design.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchEmployees();
  }, []);

  const loadPayslip = async () => {
    if (!selectedPeriod || !selectedEmployeeId) {
      setError('Please select both period and employee');
      return;
    }

    setLoading(true);
    setError(null);
    setPayslip(null);

    try {
      const res = await fetch(`/api/payslips/${selectedEmployeeId}?period=${selectedPeriod}`);
      const data = await res.json();
      
      if (data.success) {
        setPayslip(data.data);
      } else {
        setError(data.error || 'Payslip not found');
      }
    } catch (error) {
      console.error('Error loading payslip:', error);
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const exportPDF = async () => {
    if (!payslip) return;
    
    setGenerating(true);
    try {
      // Use browser print to PDF
      window.print();
    } catch (error) {
      console.error('Error exporting PDF:', error);
    } finally {
      setGenerating(false);
    }
  };

  const printPayslip = () => {
    window.print();
  };

  // Print styles
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @media print {
        .no-print { display: none !important; }
        body { background: white !important; }
        .card { box-shadow: none !important; border: 1px solid #e5e7eb !important; }
        main { padding: 0 !important; }
      }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  // Render selection form
  const renderSelectionForm = () => (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-xl font-bold text-primary">WizTech Payroll</Link>
            <span className="text-gray-500">/</span>
            <h1 className="text-2xl font-semibold text-gray-900">Payslips</h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-6">
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Select Payslip</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div>
              <PeriodPicker
                value={selectedPeriod}
                onChange={setSelectedPeriod}
                label="Payroll Period *"
              />
            </div>
            <div>
              <label className="label">Employee *</label>
              <select
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                className="input"
              >
                <option value="">Select Employee</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.employeeId} - {emp.fullName} ({emp.department})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button 
            onClick={loadPayslip} 
            disabled={loading || !selectedPeriod || !selectedEmployeeId}
            className="btn-primary"
          >
            <Loader2 className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Loading...' : 'Load Payslip'}
          </button>
          {error && (
            <p className="mt-3 text-sm text-red-600 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              {error}
            </p>
          )}
        </div>
      </main>
    </div>
  );

  // Render payslip content
  const renderPayslip = () => {
    if (!payslip) return null;

    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header - No Print */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-10 no-print">
          <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/" className="text-xl font-bold text-primary">WizTech Payroll</Link>
              <span className="text-gray-500">/</span>
              <h1 className="text-2xl font-semibold text-gray-900">Payslip</h1>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={loadPayslip} className="btn-secondary">
                <ChevronLeft className="h-4 w-4 mr-2" />
                Back
              </button>
              <button onClick={printPayslip} className="btn-secondary">
                <Printer className="h-4 w-4 mr-2" />
                Print
              </button>
              <button onClick={exportPDF} disabled={generating} className="btn-primary">
                <Download className="h-4 w-4 mr-2" />
                {generating ? 'Exporting...' : 'Print / Save as PDF'}
              </button>
            </div>
          </div>
        </header>

        {/* Payslip Content */}
        <main className="max-w-4xl mx-auto px-6 py-6">
          <div className="card">
            {/* Company Header */}
            <div className="text-center mb-8 pb-6 border-b border-gray-200">
              <h1 className="text-2xl font-bold text-primary">{payslip.companyName}</h1>
              <p className="text-gray-600">{payslip.companyAddress}</p>
              <p className="text-gray-600">Tel: {payslip.companyPhone} | Email: {payslip.companyEmail}</p>
              <p className="text-gray-600">TPIN: {payslip.companyTPIN} | Pension Fund: {payslip.pensionFund}</p>
            </div>

            {/* Payslip Title */}
            <div className="text-center mb-6">
              <h2 className="text-xl font-bold text-gray-900 border-b border-gray-300 inline-block pb-1">PAYSLIP</h2>
              <p className="text-gray-600 mt-1">Period: {payslip.payrollPeriod} ({payslip.periodStart} to {payslip.periodEnd})</p>
            </div>

            {/* Employee Info */}
            <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
              <div>
                <p className="text-gray-500">Employee ID</p>
                <p className="font-medium">{payslip.employeeId}</p>
              </div>
              <div>
                <p className="text-gray-500">Full Name</p>
                <p className="font-medium">{payslip.fullName}</p>
              </div>
              <div>
                <p className="text-gray-500">National ID</p>
                <p className="font-medium">{payslip.nationalId || 'N/A'}</p>
              </div>
              <div>
                <p className="text-gray-500">Department</p>
                <p className="font-medium">{payslip.department}</p>
              </div>
              <div>
                <p className="text-gray-500">Position</p>
                <p className="font-medium">{payslip.position}</p>
              </div>
              <div>
                <p className="text-gray-500">Employment Date</p>
                <p className="font-medium">{payslip.employmentDate}</p>
              </div>
              <div>
                <p className="text-gray-500">Bank</p>
                <p className="font-medium">{payslip.bankName || 'N/A'}</p>
              </div>
              <div>
                <p className="text-gray-500">Account No.</p>
                <p className="font-medium">{payslip.accountNumber || 'N/A'}</p>
              </div>
              <div>
                <p className="text-gray-500">Payment Method</p>
                <p className="font-medium">{payslip.paymentMethod}</p>
              </div>
              <div>
                <p className="text-gray-500">Tax Status</p>
                <p className="font-medium">{payslip.taxStatus}</p>
              </div>
            </div>

            {/* Earnings */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-3 border-b border-gray-200 pb-2">EARNINGS</h3>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="w-1/2">Description</th>
                      <th className="text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Basic Salary</td>
                      <td className="text-right font-mono">{payslip.formatted.basicSalary}</td>
                    </tr>
                    <tr>
                      <td>Allowances</td>
                      <td className="text-right font-mono">{payslip.formatted.allowances}</td>
                    </tr>
                    <tr>
                      <td>Overtime Pay</td>
                      <td className="text-right font-mono">{payslip.formatted.overtimePay}</td>
                    </tr>
                    <tr>
                      <td>Bonuses</td>
                      <td className="text-right font-mono">{payslip.formatted.bonuses}</td>
                    </tr>
                    <tr>
                      <td>Other Earnings</td>
                      <td className="text-right font-mono">{payslip.formatted.otherEarnings}</td>
                    </tr>
                    <tr className="bg-yellow-50 font-semibold">
                      <td>GROSS EARNINGS</td>
                      <td className="text-right font-mono text-blue-600">{payslip.formatted.grossEarnings}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Statutory Deductions */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-3 border-b border-gray-200 pb-2">STATUTORY DEDUCTIONS</h3>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="w-1/2">Description</th>
                      <th className="text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>PAYE</td>
                      <td className="text-right font-mono text-red-600">{payslip.formatted.paye}</td>
                    </tr>
                    <tr>
                      <td>Pension (Employee)</td>
                      <td className="text-right font-mono text-red-600">{payslip.formatted.pensionEE}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Other Deductions */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-3 border-b border-gray-200 pb-2">OTHER DEDUCTIONS</h3>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="w-1/2">Description</th>
                      <th className="text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Other Deductions</td>
                      <td className="text-right font-mono">{payslip.formatted.otherDeductions}</td>
                    </tr>
                    <tr className="bg-red-50 font-semibold">
                      <td>TOTAL DEDUCTIONS</td>
                      <td className="text-right font-mono text-red-600">{payslip.formatted.totalDeductions}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Net Pay */}
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-center">
              <p className="text-gray-500">NET PAY</p>
              <p className="text-3xl font-bold text-green-700">{payslip.formatted.netPay}</p>
            </div>

            {/* Employer Contributions (For Information) */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-3 border-b border-gray-200 pb-2">EMPLOYER CONTRIBUTIONS (For Information)</h3>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="w-1/2">Description</th>
                      <th className="text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Pension (Employer)</td>
                      <td className="text-right font-mono text-green-600">{payslip.formatted.pensionER}</td>
                    </tr>
                    <tr>
                      <td>TEVET Levy (1%)</td>
                      <td className="text-right font-mono text-green-600">{payslip.formatted.tevetLevy}</td>
                    </tr>
                    {payslip.fringeBenefitTax > 0 && (
                      <>
                        <tr>
                          <td>Fringe Benefit Taxable Base</td>
                          <td className="text-right font-mono">{payslip.formatted.fringeBenefitBase}</td>
                        </tr>
                        <tr>
                          <td>Fringe Benefit Tax ({payslip.fbtSummary?.fbtRate ?? 30}%)</td>
                          <td className="text-right font-mono text-green-600">{payslip.formatted.fringeBenefitTax}</td>
                        </tr>
                            {payslip.fbtSummary?.benefits && payslip.fbtSummary.benefits.length > 0 && (
                              <>
                                <tr className="bg-gray-50">
                                  <td colSpan={2} className="text-xs font-semibold text-gray-500 uppercase tracking-wide py-2">
                                    FBT Benefit Breakdown
                                  </td>
                                </tr>
                                {payslip.fbtSummary.benefits.map((b, i: number) => (
                                  <tr key={i} className="text-sm">
                                    <td className="pl-6 text-gray-600">
                                      {b.type} {b.classification === 'EXCLUDED' ? '(Excluded)' : ''}
                                      {b.ruleUsed && <span className="text-gray-400 ml-2">({b.ruleUsed})</span>}
                                    </td>
                                    <td className="text-right font-mono text-gray-500">
                                      {b.selectedTaxableValue > 0 ? formatCurrency(b.selectedTaxableValue) : '—'}
                                    </td>
                                  </tr>
                                ))}
                              </>
                            )}
                      </>
                    )}
                    <tr className="bg-blue-50 font-semibold">
                      <td>Total Employer Cost</td>
                      <td className="text-right font-mono text-blue-600">{payslip.formatted.employerCost}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer */}
            <div className="text-center text-xs text-gray-500 border-t border-gray-200 pt-4">
              <p>This is a computer-generated payslip. No signature required.</p>
              <p>WizTech Payroll System v1.0 | Malawi</p>
            </div>
          </div>
        </main>
      </div>
    );
  };

  return payslip ? renderPayslip() : renderSelectionForm();
}