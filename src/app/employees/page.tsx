'use client';

import { useState, useEffect } from 'react';
import { 
  Users, Plus, Search, Filter, Edit, Trash2, Eye, 
  Loader2, AlertCircle, CheckCircle, XCircle, ChevronLeft, ChevronRight,
  Download, Upload
} from 'lucide-react';
import Link from 'next/link';

interface Employee {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  nationalId: string | null;
  employmentStatus: string;
  department: string;
  position: string;
  employmentDate: string;
  employmentType: string;
  basicSalary: number;
  salaryFrequency: string;
  allowances: number;
  bankName: string | null;
  accountNumber: string | null;
  paymentMethod: string;
  pensionApplicable: boolean;
  taxStatus: string;
  taxNumber: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [departments, setDepartments] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [formData, setFormData] = useState({
    employeeId: '',
    firstName: '',
    lastName: '',
    nationalId: '',
    department: '',
    position: '',
    employmentDate: '',
    employmentType: 'Permanent',
    basicSalary: '',
    salaryFrequency: 'Monthly',
    allowances: '',
    bankName: '',
    accountNumber: '',
    paymentMethod: 'Bank Transfer',
    pensionApplicable: true,
    taxStatus: 'Taxable',
    taxNumber: '',
    notes: '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        ...(search && { search }),
        ...(departmentFilter !== 'All' && { department: departmentFilter }),
        ...(statusFilter !== 'All' && { status: statusFilter }),
      });
      const res = await fetch(`/api/employees?${params}`);
      const data = await res.json();
      if (data.success) {
        setEmployees(data.data);
        setPagination(data.pagination);
        // Extract unique departments
        const depts = [...new Set((data.data as Employee[]).map((e) => e.department))].sort();
        setDepartments(depts);
      }
    } catch (error) {
      console.error('Failed to fetch employees:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDepartments = async () => {
    try {
      const res = await fetch('/api/employees');
      const data = await res.json();
      if (data.success) {
        const depts = [...new Set((data.data as Employee[]).map((e) => e.department))].sort();
        setDepartments(depts);
      }
    } catch (error) {
      console.error('Failed to fetch departments:', error);
    }
  };

  useEffect(() => {
    // Initial data load: setLoading fires synchronously inside the fetch helper by design.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchEmployees();
    fetchDepartments();
  }, [pagination.page, search, departmentFilter, statusFilter]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormErrors({});

    try {
      const url = editingEmployee ? `/api/employees/${editingEmployee.id}` : '/api/employees';
      const method = editingEmployee ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      
      const data = await res.json();
      
      if (!data.success) {
        if (data.details) {
          const errors: Record<string, string> = {};
          data.details.forEach((err: { path: (string | number)[]; message: string }) => {
            errors[err.path[0]] = err.message;
          });
          setFormErrors(errors);
        } else {
          setFormErrors({ submit: data.error || 'Operation failed' });
        }
        return;
      }

      setShowModal(false);
      fetchEmployees();
    } catch (error) {
      console.error('Error saving employee:', error);
      setFormErrors({ submit: 'Network error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (employee: Employee) => {
    setEditingEmployee(employee);
    setFormData({
      employeeId: employee.employeeId,
      firstName: employee.firstName,
      lastName: employee.lastName,
      nationalId: employee.nationalId || '',
      department: employee.department,
      position: employee.position,
      employmentDate: employee.employmentDate.split('T')[0],
      employmentType: employee.employmentType,
      basicSalary: employee.basicSalary.toString(),
      salaryFrequency: employee.salaryFrequency,
      allowances: employee.allowances.toString(),
      bankName: employee.bankName || '',
      accountNumber: employee.accountNumber || '',
      paymentMethod: employee.paymentMethod,
      pensionApplicable: employee.pensionApplicable,
      taxStatus: employee.taxStatus,
      taxNumber: employee.taxNumber || '',
      notes: employee.notes || '',
    });
    setShowModal(true);
  };

  const handleDelete = async (employee: Employee) => {
    if (!confirm(`Deactivate employee ${employee.employeeId} (${employee.fullName})?`)) return;
    
    try {
      const res = await fetch(`/api/employees/${employee.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchEmployees();
      } else {
        alert(data.error || 'Failed to deactivate');
      }
    } catch (error) {
      console.error('Error deactivating employee:', error);
      alert('Network error');
    }
  };

  const handleNew = () => {
    setEditingEmployee(null);
    setFormData({
      employeeId: '',
      firstName: '',
      lastName: '',
      nationalId: '',
      department: '',
      position: '',
      employmentDate: new Date().toISOString().split('T')[0],
      employmentType: 'Permanent',
      basicSalary: '',
      salaryFrequency: 'Monthly',
      allowances: '',
      bankName: '',
      accountNumber: '',
      paymentMethod: 'Bank Transfer',
      pensionApplicable: true,
      taxStatus: 'Taxable',
      taxNumber: '',
      notes: '',
    });
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingEmployee(null);
    setFormErrors({});
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-MW', {
      style: 'currency',
      currency: 'MWK',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-xl font-bold text-primary">WizTech Payroll</Link>
            <span className="text-gray-500">/</span>
            <h1 className="text-2xl font-semibold text-gray-900">Employees</h1>
          </div>
          <button onClick={handleNew} className="btn-primary">
            <Plus className="h-4 w-4 shrink-0" />
            Add Employee
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* Filters */}
        <div className="card mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label className="label">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, ID..."
                  className="input pl-10"
                />
              </div>
            </div>
            <div className="w-full sm:w-48">
              <label className="label">Department</label>
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="input"
              >
                <option value="All">All Departments</option>
                {departments.map((dept) => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>
            <div className="w-full sm:w-40">
              <label className="label">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="input"
              >
                <option value="All">All Status</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="card">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Employee ID</th>
                      <th>Name</th>
                      <th>Department</th>
                      <th>Position</th>
                      <th>Employment Date</th>
                      <th>Type</th>
                      <th className="text-right">Basic Salary</th>
                      <th className="text-right">Allowances</th>
                      <th>Status</th>
                      <th className="w-32">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
                          No employees found
                        </td>
                      </tr>
                    ) : (
                      employees.map((emp) => (
                        <tr key={emp.id}>
                          <td className="font-mono text-sm">{emp.employeeId}</td>
                          <td className="font-medium">{emp.fullName}</td>
                          <td>{emp.department}</td>
                          <td>{emp.position}</td>
                          <td>{emp.employmentDate.split('T')[0]}</td>
                          <td>
                            <span className={`badge ${emp.employmentType === 'Permanent' ? 'badge-info' : 'badge-warning'}`}>
                              {emp.employmentType}
                            </span>
                          </td>
                          <td className="text-right font-mono">{formatCurrency(emp.basicSalary)}</td>
                          <td className="text-right font-mono">{formatCurrency(emp.allowances)}</td>
                          <td>
                            <span className={`badge ${emp.isActive ? 'badge-success' : 'badge-danger'}`}>
                              {emp.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleEdit(emp)}
                                className="p-2 text-gray-500 hover:text-primary hover:bg-gray-100 rounded-lg transition-colors"
                                title="Edit"
                                aria-label={`Edit ${emp.fullName}`}
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDelete(emp)}
                                disabled={!emp.isActive}
                                className="p-2 text-gray-500 hover:text-danger hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title={emp.isActive ? 'Deactivate' : 'Already Inactive'}
                                aria-label={emp.isActive ? `Deactivate ${emp.fullName}` : `${emp.fullName} already inactive`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
                  <p className="text-sm text-gray-500">
                    Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
                    {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                    {pagination.total} employees
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                      disabled={pagination.page === 1}
                      className="btn-secondary"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="text-sm text-gray-600">
                      Page {pagination.page} of {pagination.totalPages}
                    </span>
                    <button
                      onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                      disabled={pagination.page === pagination.totalPages}
                      className="btn-secondary"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="employeeModalTitle"
            aria-label="Employee form"
            onKeyDown={(e) => { if (e.key === 'Escape') handleCloseModal(); }}
            className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
          >
            <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 id="employeeModalTitle" className="text-xl font-semibold text-gray-900">
                {editingEmployee ? 'Edit Employee' : 'Add Employee'}
              </h2>
              <button onClick={handleCloseModal} className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100" aria-label="Close">
                <XCircle className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="label">Employee ID *</label>
                  <input
                    type="text"
                    value={formData.employeeId}
                    onChange={(e) => setFormData({ ...formData, employeeId: e.target.value.toUpperCase() })}
                    className="input"
                    placeholder="EMP001"
                    disabled={!!editingEmployee}
                    required
                  />
                  {formErrors.employeeId && <p className="text-sm text-danger mt-1">{formErrors.employeeId}</p>}
                </div>
                <div>
                  <label className="label">Employment Type</label>
                  <select
                    value={formData.employmentType}
                    onChange={(e) => setFormData({ ...formData, employmentType: e.target.value })}
                    className="input"
                  >
                    <option value="Permanent">Permanent</option>
                    <option value="Contract">Contract</option>
                  </select>
                </div>
                <div>
                  <label className="label">First Name *</label>
                  <input
                    type="text"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className="input"
                    required
                  />
                  {formErrors.firstName && <p className="text-sm text-danger mt-1">{formErrors.firstName}</p>}
                </div>
                <div>
                  <label className="label">Last Name *</label>
                  <input
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="input"
                    required
                  />
                  {formErrors.lastName && <p className="text-sm text-danger mt-1">{formErrors.lastName}</p>}
                </div>
                <div>
                  <label className="label">National ID</label>
                  <input
                    type="text"
                    value={formData.nationalId}
                    onChange={(e) => setFormData({ ...formData, nationalId: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Department *</label>
                  <select
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="input"
                    required
                  >
                    <option value="">Select Department</option>
                    <option value="IT">IT</option>
                    <option value="Finance">Finance</option>
                    <option value="HR">HR</option>
                    <option value="Sales">Sales</option>
                    <option value="Admin">Admin</option>
                  </select>
                  {formErrors.department && <p className="text-sm text-danger mt-1">{formErrors.department}</p>}
                </div>
                <div>
                  <label className="label">Position *</label>
                  <input
                    type="text"
                    value={formData.position}
                    onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                    className="input"
                    required
                  />
                  {formErrors.position && <p className="text-sm text-danger mt-1">{formErrors.position}</p>}
                </div>
                <div>
                  <label className="label">Employment Date *</label>
                  <input
                    type="date"
                    value={formData.employmentDate}
                    onChange={(e) => setFormData({ ...formData, employmentDate: e.target.value })}
                    className="input"
                    required
                  />
                  {formErrors.employmentDate && <p className="text-sm text-danger mt-1">{formErrors.employmentDate}</p>}
                </div>
                <div>
                  <label className="label">Basic Salary (MWK) *</label>
                  <input
                    type="number"
                    value={formData.basicSalary}
                    onChange={(e) => setFormData({ ...formData, basicSalary: e.target.value })}
                    className="input"
                    min="1"
                    step="1000"
                    required
                  />
                  {formErrors.basicSalary && <p className="text-sm text-danger mt-1">{formErrors.basicSalary}</p>}
                </div>
                <div>
                  <label className="label">Allowances (MWK)</label>
                  <input
                    type="number"
                    value={formData.allowances}
                    onChange={(e) => setFormData({ ...formData, allowances: e.target.value })}
                    className="input"
                    min="0"
                    step="1000"
                  />
                </div>
                <div>
                  <label className="label">Salary Frequency</label>
                  <select
                    value={formData.salaryFrequency}
                    onChange={(e) => setFormData({ ...formData, salaryFrequency: e.target.value })}
                    className="input"
                  >
                    <option value="Monthly">Monthly</option>
                    <option value="Weekly">Weekly</option>
                    <option value="Fortnightly">Fortnightly</option>
                  </select>
                </div>
                <div>
                  <label className="label">Bank Name</label>
                  <input
                    type="text"
                    value={formData.bankName}
                    onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Account Number</label>
                  <input
                    type="text"
                    value={formData.accountNumber}
                    onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Payment Method</label>
                  <select
                    value={formData.paymentMethod}
                    onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                    className="input"
                  >
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Cash">Cash</option>
                    <option value="Mobile Money">Mobile Money</option>
                  </select>
                </div>
                <div>
                  <label className="label">Tax Status</label>
                  <select
                    value={formData.taxStatus}
                    onChange={(e) => setFormData({ ...formData, taxStatus: e.target.value })}
                    className="input"
                  >
                    <option value="Taxable">Taxable</option>
                    <option value="Exempt">Exempt</option>
                  </select>
                </div>
                <div>
                  <label className="label">Tax Number (TPIN)</label>
                  <input
                    type="text"
                    value={formData.taxNumber}
                    onChange={(e) => setFormData({ ...formData, taxNumber: e.target.value })}
                    className="input"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="label">Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="input"
                    rows={3}
                  />
                </div>
                <div className="md:col-span-2 flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.pensionApplicable}
                      onChange={(e) => setFormData({ ...formData, pensionApplicable: e.target.checked })}
                      className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                    />
                    <span className="text-sm text-gray-700">Pension Applicable</span>
                  </label>
                </div>
              </div>

              {formErrors.submit && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {formErrors.submit}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button type="button" onClick={handleCloseModal} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn-primary">
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Saving...
                    </>
                  ) : (
                    editingEmployee ? 'Update' : 'Create'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}