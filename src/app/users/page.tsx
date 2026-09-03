'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Plus,
  Edit,
  Trash2,
  Loader2,
  XCircle,
  Eye,
  EyeOff,
  ShieldAlert,
} from 'lucide-react';
import { useCurrentUser } from '@/components/UserContext';
import { useToast } from '@/hooks/useToast';

type Role = 'ADMIN' | 'PAYROLL_OPERATOR' | 'VIEWER';
type Status = 'ACTIVE' | 'INACTIVE';

interface ManagedUser {
  id: string;
  email: string;
  role: Role;
  status: Status;
  businessId: string | null;
  createdAt: string;
  updatedAt: string;
}

const roleLabels: Record<string, string> = {
  ADMIN: 'Admin',
  PAYROLL_OPERATOR: 'Payroll Operator',
  VIEWER: 'Viewer',
  SUPER_ADMIN: 'Super Admin',
};

const manageableRoleOptions: Role[] = ['ADMIN', 'PAYROLL_OPERATOR', 'VIEWER'];

const emptyForm = {
  email: '',
  password: '',
  confirmPassword: '',
  role: 'VIEWER' as Role,
  status: 'ACTIVE' as Status,
};

export default function UsersPage() {
  const currentUser = useCurrentUser();
  const { showToast, Toast } = useToast();

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/users', { credentials: 'same-origin' });
      const json = await res.json();
      if (json.success) {
        setUsers(json.data as ManagedUser[]);
      }
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial data load — reading state then refetching on demand is the
    // intended flow; the synchronous setLoading within fetch is intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchUsers();
  }, [fetchUsers]);

  function handleNew() {
    setEditingUser(null);
    setForm(emptyForm);
    setFormErrors({});
    setSubmitError(null);
    setShowModal(true);
  }

  function handleEdit(user: ManagedUser) {
    setEditingUser(user);
    setForm({
      email: user.email,
      password: '',
      confirmPassword: '',
      role: user.role,
      status: user.status,
    });
    setFormErrors({});
    setSubmitError(null);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingUser(null);
  }

  function validate(formData: typeof form): Record<string, string> {
    const errors: Record<string, string> = {};
    if (!formData.email.trim()) errors.email = 'Email is required';
    else if (!/^\S+@\S+\.\S+$/.test(formData.email)) errors.email = 'Enter a valid email address';

    if (!editingUser && !formData.password) {
      errors.password = 'Password is required';
    }
    if (formData.password) {
      if (formData.password.length < 8) errors.password = 'Password must be at least 8 characters';
      else if (!/[A-Z]/.test(formData.password)) errors.password = 'Password must contain at least one uppercase letter';
      else if (!/[0-9]/.test(formData.password)) errors.password = 'Password must contain at least one number';
      if (formData.password !== formData.confirmPassword) {
        errors.confirmPassword = 'Passwords do not match';
      }
    }
    return errors;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    const errors = validate(form);
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});
    setSubmitting(true);
    try {
      if (editingUser) {
        const body: Record<string, string | undefined> = {
          email: form.email,
          role: form.role,
          status: form.status,
        };
        if (form.password) body.password = form.password;
        const res = await fetch(`/api/users/${editingUser.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!res.ok) {
          setSubmitError(json.error ?? 'Failed to update user');
          return;
        }
      } else {
        const res = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            email: form.email,
            role: form.role,
            password: form.password,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          setSubmitError(json.error ?? 'Failed to create user');
          return;
        }
      }
      closeModal();
      await fetchUsers();
    } catch {
      setSubmitError('A network error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeactivate(user: ManagedUser) {
    if (!window.confirm(`Deactivate user ${user.email}? They will no longer be able to sign in.`)) {
      return;
    }
    setSubmitError(null);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      const json = await res.json();
      if (!res.ok) {
        showToast(json.error ?? 'Failed to deactivate user');
        return;
      }
      await fetchUsers();
    } catch {
      showToast('A network error occurred. Please try again.');
    }
  }

  // Only an authenticated user with a business tenant may manage users; the
  // server enforces this too.
  const canManage = Boolean(currentUser?.businessId);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-semibold text-gray-900">Users</h1>
          </div>
          <button onClick={handleNew} className="btn-primary" disabled={!canManage}>
            <Plus className="h-4 w-4 shrink-0" />
            Add User
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        {!canManage && (
          <div className="card mb-6 p-4 flex items-center gap-3 text-amber-800 bg-amber-50 border-amber-200">
            <ShieldAlert className="h-5 w-5 shrink-0" />
            <p className="text-sm">
              You need an assigned business to manage users. Contact a system administrator.
            </p>
          </div>
        )}

        <div className="card">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th className="w-32">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                        No users found
                      </td>
                    </tr>
                  ) : (
                    users.map((user) => {
                      const isSelf = currentUser?.id === user.id;
                      return (
                        <tr key={user.id}>
                          <td className="font-medium">
                            {user.email}
                            {isSelf && (
                              <span className="ml-2 badge badge-info">You</span>
                            )}
                          </td>
                          <td>
                            <span className={`badge ${user.role === 'ADMIN' ? 'badge-warning' : 'badge-info'}`}>
                              {roleLabels[user.role] ?? user.role}
                            </span>
                          </td>
                          <td>
                            <span className={`badge ${user.status === 'ACTIVE' ? 'badge-success' : 'badge-danger'}`}>
                              {user.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                          <td>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleEdit(user)}
                                className="btn-icon hover:text-primary"
                                title="Edit"
                                aria-label={`Edit ${user.email}`}
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDeactivate(user)}
                                disabled={user.status !== 'ACTIVE' || isSelf}
                                className="btn-icon hover:text-danger"
                                title={
                                  isSelf
                                    ? 'You cannot deactivate your own account'
                                    : user.status !== 'ACTIVE'
                                      ? 'Already Inactive'
                                      : 'Deactivate'
                                }
                                aria-label={`Deactivate ${user.email}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
          onKeyDown={(e) => { if (e.key === 'Escape') closeModal(); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="userModalTitle"
            aria-label="User form"
            className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
          >
            <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 id="userModalTitle" className="text-xl font-semibold text-gray-900">
                {editingUser ? `Edit ${editingUser.email}` : 'Add User'}
              </h2>
              <button onClick={closeModal} autoFocus className="btn-icon" aria-label="Close">
                <XCircle className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div>
                <label className="label">Email *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="input"
                  placeholder="user@example.com"
                  required
                />
                {formErrors.email && <p className="text-sm text-danger mt-1">{formErrors.email}</p>}
              </div>

              <div>
                <label className="label">Role *</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                  className="input"
                  disabled={editingUser ? currentUser?.id === editingUser.id : false}
                >
                  {manageableRoleOptions.map((role) => (
                    <option key={role} value={role}>{roleLabels[role]}</option>
                  ))}
                </select>
                {editingUser && currentUser?.id === editingUser.id && (
                  <p className="text-xs text-gray-500 mt-1">You cannot change your own role.</p>
                )}
              </div>

              {editingUser && (
                <div>
                  <label className="label">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as Status })}
                    className="input"
                    disabled={currentUser?.id === editingUser.id}
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                  {currentUser?.id === editingUser.id && (
                    <p className="text-xs text-gray-500 mt-1">You cannot deactivate your own account.</p>
                  )}
                </div>
              )}

              <div>
                <label className="label">
                  {editingUser ? 'New Password (leave blank to keep current)' : 'Password *'}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="input pr-10"
                    placeholder="At least 8 chars, 1 uppercase, 1 number"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {formErrors.password && <p className="text-sm text-danger mt-1">{formErrors.password}</p>}
              </div>

              <div>
                <label className="label">Confirm Password{!editingUser ? ' *' : ''}</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.confirmPassword}
                  onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                  className="input"
                  autoComplete="new-password"
                />
                {formErrors.confirmPassword && (
                  <p className="text-sm text-danger mt-1">{formErrors.confirmPassword}</p>
                )}
              </div>

              {submitError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {submitError}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button type="button" onClick={closeModal} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn-primary">
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Saving...
                    </>
                  ) : (
                    editingUser ? 'Update' : 'Create'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <Toast />
    </div>
  );
}