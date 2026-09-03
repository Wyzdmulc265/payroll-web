'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Loader2, Plus, Edit, Building2, ShieldCheck, XCircle } from 'lucide-react';

interface BusinessDto {
  id: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
  _count: { users: number; employees: number };
}

interface BusinessesResponse {
  success: boolean;
  error?: string;
  data?: BusinessDto[];
  pagination?: { page: number; total: number; totalPages: number };
}

const emptyCreateForm = {
  name: '',
  adminEmail: '',
  adminPassword: '',
  adminConfirm: '',
};

export default function BusinessesPage() {
  const [businesses, setBusinesses] = useState<BusinessDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editing, setEditing] = useState<BusinessDto | null>(null);
  const [editName, setEditName] = useState('');
  const [editStatus, setEditStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const fetchBusinesses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/businesses', { credentials: 'same-origin' });
      const json: BusinessesResponse = await res.json();
      if (!json.success || !json.data) {
        setError(json.error ?? 'Failed to load businesses');
        setBusinesses([]);
        return;
      }
      setBusinesses(json.data);
    } catch {
      setError('Failed to load businesses');
      setBusinesses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchBusinesses();
  }, [fetchBusinesses]);

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreateError(null);
    if (!createForm.name.trim()) { setCreateError('Business name is required'); return; }
    if (createForm.adminEmail && !createForm.adminPassword) { setCreateError('Initial admin password is required'); return; }
    if (createForm.adminPassword && createForm.adminPassword !== createForm.adminConfirm) { setCreateError('Passwords do not match'); return; }
    setCreating(true);
    fetch('/api/businesses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        name: createForm.name.trim(),
        ...(createForm.adminEmail
          ? { initialAdmin: { email: createForm.adminEmail.trim(), password: createForm.adminPassword } }
          : {}),
      }),
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json.success) {
          setCreateError(json.error ?? 'Failed to create business');
          return;
        }
        setShowCreate(false);
        setCreateForm(emptyCreateForm);
        await fetchBusinesses();
      })
      .catch(() => setCreateError('Failed to create business'))
      .finally(() => setCreating(false));
  }

  function openEdit(b: BusinessDto) {
    setEditing(b);
    setEditName(b.name);
    setEditStatus(b.status);
    setEditError(null);
  }

  function handleSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setEditError(null);
    if (!editName.trim()) { setEditError('Business name is required'); return; }
    setSaving(true);
    fetch(`/api/businesses/${editing.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ name: editName.trim(), status: editStatus }),
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json.success) {
          setEditError(json.error ?? 'Failed to update business');
          return;
        }
        setEditing(null);
        await fetchBusinesses();
      })
      .catch(() => setEditError('Failed to update business'))
      .finally(() => setSaving(false));
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" aria-hidden="true" />
            Businesses
          </h1>
          <p className="text-sm text-gray-500 mt-1">Tenant lifecycle management (Super Admin)</p>
        </div>
        <button
          onClick={() => { setShowCreate(true); setCreateError(null); }}
          className="btn-primary"
        >
          <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
          New Business
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">
          {error}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-4 py-2 text-left font-medium text-gray-500">Name</th>
                <th scope="col" className="px-4 py-2 text-left font-medium text-gray-500">Status</th>
                <th scope="col" className="px-4 py-2 text-left font-medium text-gray-500">Users</th>
                <th scope="col" className="px-4 py-2 text-left font-medium text-gray-500">Employees</th>
                <th scope="col" className="px-4 py-2 text-left font-medium text-gray-500">Created</th>
                <th scope="col" className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" aria-hidden="true" />
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && businesses.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    No businesses yet.
                  </td>
                </tr>
              )}
              {businesses.map((b) => (
                <tr key={b.id}>
                  <td className="px-4 py-2 font-medium text-gray-900">{b.name}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                      b.status === 'ACTIVE'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-200 text-gray-600'
                    }`}>
                      {b.status === 'ACTIVE'
                        ? <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                        : <XCircle className="h-3 w-3" aria-hidden="true" />}
                      {b.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-700">{b._count.users}</td>
                  <td className="px-4 py-2 text-gray-700">{b._count.employees}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-gray-500">
                    {new Date(b.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => openEdit(b)}
                      className="btn-icon"
                      aria-label={`Edit ${b.name}`}
                    >
                      <Edit className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true" aria-label="Create business">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">New Business</h2>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="label" htmlFor="biz-name">Business name</label>
                <input id="biz-name" className="input" value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} required />
              </div>
              <p className="text-xs text-gray-500">Optionally provision an initial admin user:</p>
              <div>
                <label className="label" htmlFor="biz-admin-email">Initial admin email</label>
                <input id="biz-admin-email" type="email" className="input" value={createForm.adminEmail}
                  onChange={(e) => setCreateForm({ ...createForm, adminEmail: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="biz-admin-pass">Initial admin password</label>
                <input id="biz-admin-pass" type="password" className="input" value={createForm.adminPassword}
                  onChange={(e) => setCreateForm({ ...createForm, adminPassword: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="biz-admin-confirm">Confirm password</label>
                <input id="biz-admin-confirm" type="password" className="input" value={createForm.adminConfirm}
                  onChange={(e) => setCreateForm({ ...createForm, adminConfirm: e.target.value })} />
              </div>
              {createError && <p className="text-sm text-red-600">{createError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={creating}>
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : 'Create Business'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true" aria-label={`Edit ${editing.name}`}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Edit Business</h2>
            <form onSubmit={handleSaveEdit} className="space-y-3">
              <div>
                <label className="label" htmlFor="biz-edit-name">Business name</label>
                <input id="biz-edit-name" className="input" value={editName}
                  onChange={(e) => setEditName(e.target.value)} required />
              </div>
              <div>
                <label className="label" htmlFor="biz-edit-status">Status</label>
                <select id="biz-edit-status" className="input" value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as 'ACTIVE' | 'INACTIVE')}>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              </div>
              {editError && <p className="text-sm text-red-600">{editError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
