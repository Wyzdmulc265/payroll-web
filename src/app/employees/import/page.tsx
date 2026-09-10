'use client';

import { useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useToast } from '@/hooks/useToast';
import { importEmployeeRowSchema, IMPORT_COLUMNS } from '@/lib/import-employees';
import type { ImportEmployeeRow } from '@/lib/import-employees';
import Papa from 'papaparse';
import ExcelJS from 'exceljs';
import {
  Upload,
  FileSpreadsheet,
  Download,
  ChevronLeft,
  CheckCircle2,
  Loader2,
  X,
  AlertTriangle,
} from 'lucide-react';

interface ParsedRow {
  rowIndex: number;
  data: Record<string, unknown>;
  errors: string[];
}

export default function EmployeeImportPage() {
  const { showToast, Toast } = useToast();
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; failed: Array<{ rowIndex: number; employeeId: string; error: string }> } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = useCallback(() => {
    setFileName(null);
    setParsedRows([]);
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const parseFile = useCallback((file: File) => {
    setFileName(file.name);
    setImportResult(null);

    const ext = file.name.split('.').pop()?.toLowerCase();

    const processRows = (rows: Record<string, string>[]) => {
      if (rows.length === 0) {
        showToast('The file appears to be empty', 'error');
        return;
      }

      const parsed: ParsedRow[] = rows.map((row, idx) => {
        const mapped: Record<string, unknown> = {
          employeeId: String(row['Employee ID'] || row['employeeId'] || '').trim(),
          firstName: String(row['First Name'] || row['firstName'] || '').trim(),
          lastName: String(row['Last Name'] || row['lastName'] || '').trim(),
          nationalId: String(row['National ID'] || row['nationalId'] || '').trim(),
          department: String(row['Department'] || row['department'] || '').trim(),
          position: String(row['Position'] || row['position'] || '').trim(),
          employmentDate: String(row['Employment Date'] || row['employmentDate'] || '').trim(),
          employmentType: (String(row['Employment Type'] || row['employmentType'] || 'Permanent').trim() as 'Permanent' | 'Contract') || 'Permanent',
          basicSalary: String(row['Basic Salary (MWK)'] || row['basicSalary'] || '').trim(),
          salaryFrequency: (String(row['Salary Frequency'] || row['salaryFrequency'] || 'Monthly').trim() as 'Monthly' | 'Weekly' | 'Fortnightly') || 'Monthly',
          allowances: String(row['Allowances (MWK)'] || row['allowances'] || '0').trim(),
          bankName: String(row['Bank Name'] || row['bankName'] || '').trim(),
          accountNumber: String(row['Account Number'] || row['accountNumber'] || '').trim(),
          paymentMethod: (String(row['Payment Method'] || row['paymentMethod'] || 'Bank Transfer').trim() as 'Bank Transfer' | 'Cash' | 'Mobile Money') || 'Bank Transfer',
          pensionApplicable: String(row['Pension Applicable'] || row['pensionApplicable'] || 'true').trim().toLowerCase() === 'true',
          taxStatus: (String(row['Tax Status'] || row['taxStatus'] || 'Taxable').trim() as 'Taxable' | 'Exempt') || 'Taxable',
          taxNumber: String(row['Tax Number (TPIN)'] || row['taxNumber'] || '').trim(),
          notes: String(row['Notes'] || row['notes'] || '').trim(),
        };

        const result = importEmployeeRowSchema.safeParse(mapped);
        const errors = result.success ? [] : result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
        return { rowIndex: idx + 1, data: mapped, errors };
      });

      const validCount = parsed.filter((r) => r.errors.length === 0).length;
      const errorCount = parsed.length - validCount;

      setParsedRows(parsed);
      if (errorCount > 0) {
        showToast(`Parsed ${parsed.length} rows: ${validCount} valid, ${errorCount} with errors`, 'warning');
      } else {
        showToast(`Parsed ${parsed.length} rows — all valid`, 'success');
      }
    };

    if (ext === 'csv') {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => processRows(results.data as Record<string, string>[]),
        error: () => showToast('Failed to parse CSV file', 'error'),
      });
    } else if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const buffer = e.target?.result as ArrayBuffer;
          const workbook = new ExcelJS.Workbook();
          await workbook.xlsx.load(buffer);
          const sheet = workbook.getWorksheet(workbook.worksheets[0]?.name || '');
          if (!sheet) {
            showToast('No sheets found in the file', 'error');
            return;
          }
          const rows: Record<string, string>[] = [];
          const headers: string[] = [];
          sheet.eachRow((row, rowNumber) => {
            const rowData: Record<string, string> = {};
            row.eachCell((cell, colNumber) => {
              if (rowNumber === 1) {
                headers[colNumber - 1] = String(cell.value || '').trim();
              } else {
                const header = headers[colNumber - 1] || `col_${colNumber}`;
                rowData[header] = String(cell.value || '').trim();
              }
            });
            if (rowNumber > 1) {
              rows.push(rowData);
            }
          });
          processRows(rows);
        } catch {
          showToast('Failed to parse XLSX file', 'error');
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      showToast('Unsupported file format', 'error');
    }
  }, [showToast]);

  const handleFile = useCallback((file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext && !['csv', 'xlsx', 'xls'].includes(ext)) {
      showToast('Only CSV and XLSX files are supported', 'error');
      return;
    }
    parseFile(file);
  }, [parseFile, showToast]);

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const onBrowse = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const downloadTemplate = useCallback(() => {
    const headers = IMPORT_COLUMNS.map((c) => c.label.replace(' *', '')).join(',');
    const sample = [
      'EMP001,John,Doe,1990010112345678901,Finance,Accountant,2024-01-15,Permanent,1500000,Monthly,200000,National Bank,123456789,Bank Transfer,true,Taxable,TPIN001,Notes here',
      'EMP002,Jane,Smith,,IT,Developer,2024-02-01,Contract,2000000,Monthly,0,,,,true,Exempt,,',
    ].join('\n');
    const csv = `${headers}\n${sample}\n`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'employee_import_template.csv';
    link.click();
    URL.revokeObjectURL(link.href);
    showToast('Template downloaded', 'success');
  }, [showToast]);

  const handleImport = useCallback(async () => {
    const validRows = parsedRows.filter((r) => r.errors.length === 0).map((r) => r.data as ImportEmployeeRow);
    if (validRows.length === 0) {
      showToast('No valid rows to import', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/employees/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: validRows }),
      });
      const data = await res.json();
      if (data.success) {
        setImportResult(data.data);
        showToast(`Imported ${data.data.imported} employee(s)`, 'success');
      } else {
        showToast(data.error || 'Import failed', 'error');
      }
    } catch {
      showToast('Network error during import', 'error');
    } finally {
      setSubmitting(false);
    }
  }, [parsedRows, showToast]);

  const validRows = parsedRows.filter((r) => r.errors.length === 0);
  const errorRows = parsedRows.filter((r) => r.errors.length > 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/employees" className="text-xl font-bold text-primary">WizTech Payroll</Link>
            <span className="text-gray-500">/</span>
            <h1 className="text-2xl font-semibold text-gray-900">Import Employees</h1>
          </div>
          <Link href="/employees" className="btn-secondary">
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to Employees
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {!importResult ? (
          <>
            {parsedRows.length === 0 ? (
              <div className="card">
                <div
                  onDrop={onDrop}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
                    dragOver ? 'border-primary bg-primary-light/10' : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  <Upload className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                  <p className="text-lg font-medium text-gray-900 mb-1">Drag and drop your file here</p>
                  <p className="text-sm text-gray-500 mb-4">Supports CSV, XLSX, and XLS files</p>
                  <button type="button" className="btn-primary" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Browse Files
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={onBrowse}
                    className="hidden"
                  />
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <p className="text-sm text-gray-500">
                    {fileName ? `Selected: ${fileName}` : 'No file selected'}
                  </p>
                  <button onClick={downloadTemplate} className="btn-secondary">
                    <Download className="h-4 w-4 mr-2" />
                    Download Template
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="card">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-gray-900">
                      Preview — {parsedRows.length} row(s) parsed
                    </h2>
                    <button onClick={resetState} className="btn-secondary">
                      <X className="h-4 w-4 mr-2" />
                      Clear
                    </button>
                  </div>

                  {errorRows.length > 0 && (
                    <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>{errorRows.length} row(s) have validation errors and will be skipped during import.</span>
                    </div>
                  )}

                  <div className="table-container max-h-[50vh] overflow-y-auto">
                    <table className="table">
                      <thead className="sticky top-0 bg-gray-50">
                        <tr>
                          <th className="w-16">Row</th>
                          <th>Employee ID</th>
                          <th>First Name</th>
                          <th>Last Name</th>
                          <th>Department</th>
                          <th>Position</th>
                          <th>Employment Date</th>
                          <th className="text-right">Basic Salary</th>
                          <th>Status</th>
                          <th>Errors</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedRows.map((row) => {
                          const hasErrors = row.errors.length > 0;
                          return (
                            <tr key={row.rowIndex} className={hasErrors ? 'bg-red-50' : ''}>
                              <td className="text-sm text-gray-500">{row.rowIndex}</td>
                              <td className="font-mono text-sm">{String(row.data.employeeId || '')}</td>
                              <td>{String(row.data.firstName || '')}</td>
                              <td>{String(row.data.lastName || '')}</td>
                              <td>{String(row.data.department || '')}</td>
                              <td>{String(row.data.position || '')}</td>
                              <td>{String(row.data.employmentDate || '')}</td>
                              <td className="text-right font-mono">{String(row.data.basicSalary || '')}</td>
                              <td>
                                {hasErrors ? (
                                  <span className="badge badge-danger">Invalid</span>
                                ) : (
                                  <span className="badge badge-success">Valid</span>
                                )}
                              </td>
                              <td>
                                {hasErrors && (
                                  <div className="text-xs text-red-700 max-w-xs">
                                    {row.errors.map((err, i) => (
                                      <div key={i}>{err}</div>
                                    ))}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    <p className="text-sm text-gray-600">
                      <span className="badge badge-success mr-2">{validRows.length} valid</span>
                      <span className="badge badge-danger">{errorRows.length} errors</span>
                    </p>
                    <button
                      onClick={handleImport}
                      disabled={submitting || validRows.length === 0}
                      className="btn-primary"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Importing...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          Import {validRows.length} Employee(s)
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Import Complete</h2>
            <div className="flex items-start gap-3 mb-6">
              <CheckCircle2 className="h-6 w-6 text-green-600 mt-1 shrink-0" />
              <div>
                <p className="text-gray-900 font-medium">{importResult.imported} employee(s) imported successfully</p>
                {importResult.failed.length > 0 && (
                  <p className="text-sm text-gray-500 mt-1">{importResult.failed.length} row(s) failed (duplicate IDs or validation errors)</p>
                )}
              </div>
            </div>

            {importResult.failed.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-900 mb-2">Failed Rows</h3>
                <div className="table-container max-h-64 overflow-y-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Row</th>
                        <th>Employee ID</th>
                        <th>Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importResult.failed.map((fail) => (
                        <tr key={fail.rowIndex}>
                          <td className="text-sm">{fail.rowIndex}</td>
                          <td className="font-mono text-sm">{fail.employeeId}</td>
                          <td className="text-sm text-red-700">{fail.error}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={resetState} className="btn-primary">
                Import More
              </button>
              <Link href="/employees" className="btn-secondary">
                Back to Employees
              </Link>
            </div>
          </div>
        )}
      </main>
      <Toast />
    </div>
  );
}
