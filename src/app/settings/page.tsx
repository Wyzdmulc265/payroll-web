'use client';

import { useState, useEffect } from 'react';
import { 
  Settings, Building2, DollarSign, CreditCard, Shield, 
  Loader2, Save, CheckCircle, AlertCircle, Plus, Edit, Trash2,
  Eye, EyeOff, Key, Database, Cpu, Globe, Wrench
} from 'lucide-react';

interface Setting {
  id: string;
  key: string;
  value: string;
  description: string | null;
  category: string;
  effectiveFrom: string;
  createdAt: string;
  updatedAt: string;
}

const CATEGORIES = ['COMPANY', 'PAYROLL', 'STATUTORY', 'SYSTEM'] as const;
type Category = typeof CATEGORIES[number];

const CATEGORY_ICONS: Record<Category, any> = {
  COMPANY: Building2,
  PAYROLL: DollarSign,
  STATUTORY: Shield,
  SYSTEM: Wrench,
};

const CATEGORY_COLORS: Record<Category, string> = {
  COMPANY: 'bg-blue-100 text-blue-700',
  PAYROLL: 'bg-green-100 text-green-700',
  STATUTORY: 'bg-purple-100 text-purple-700',
  SYSTEM: 'bg-gray-100 text-gray-700',
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [activeCategory, setActiveCategory] = useState<Category>('COMPANY');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingSetting, setEditingSetting] = useState<Setting | null>(null);
  const [formData, setFormData] = useState({
    key: '',
    value: '',
    description: '',
    category: 'COMPANY' as Category,
    effectiveFrom: new Date().toISOString().split('T')[0],
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.success) {
        setSettings(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const filteredSettings = settings.filter(s => s.category === activeCategory);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(editingSetting?.id || 'new');
    setFormErrors({});

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      
      const data = await res.json();
      
      if (!data.success) {
        if (data.details) {
          const errors: Record<string, string> = {};
          data.details.forEach((err: any) => {
            errors[err.path[0]] = err.message;
          });
          setFormErrors(errors);
        } else {
          setFormErrors({ submit: data.error || 'Operation failed' });
        }
        return;
      }

      setShowModal(false);
      fetchSettings();
    } catch (error) {
      console.error('Error saving setting:', error);
      setFormErrors({ submit: 'Network error' });
    } finally {
      setSaving(null);
    }
  };

  const handleEdit = (setting: Setting) => {
    setEditingSetting(setting);
    setFormData({
      key: setting.key,
      value: setting.value,
      description: setting.description || '',
      category: setting.category as Category,
      effectiveFrom: setting.effectiveFrom.split('T')[0],
    });
    setShowModal(true);
  };

  const handleDelete = async (setting: Setting) => {
    if (!confirm(`Delete setting ${setting.key}?`)) return;
    
    // Note: No DELETE endpoint yet, would need to add
    alert('Delete not implemented yet');
  };

  const handleNew = () => {
    setEditingSetting(null);
    setFormData({
      key: '',
      value: '',
      description: '',
      category: activeCategory,
      effectiveFrom: new Date().toISOString().split('T')[0],
    });
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingSetting(null);
    setFormErrors({});
  };

  const maskValue = (key: string, value: string) => {
    const sensitiveKeys = ['password', 'secret', 'key', 'token', 'tpin'];
    if (sensitiveKeys.some(k => key.toLowerCase().includes(k))) {
      return '•'.repeat(12);
    }
    return value;
  };

  const isSensitive = (key: string) => {
    const sensitiveKeys = ['password', 'secret', 'key', 'token', 'tpin'];
    return sensitiveKeys.some(k => key.toLowerCase().includes(k));
  };

  const [showSensitive, setShowSensitive] = useState<Record<string, boolean>>({});

  const toggleSensitive = (key: string) => {
    setShowSensitive(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a href="/" className="text-xl font-bold text-primary">WizTech Payroll</a>
            <span className="text-gray-500">/</span>
            <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
          </div>
          <button onClick={handleNew} className="btn-primary">
            <Plus className="h-4 w-4 mr-2" />
            Add Setting
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* Category Tabs */}
        <div className="card mb-6">
          <div className="flex flex-wrap gap-1" role="tablist">
            {CATEGORIES.map((cat) => {
              const Icon = CATEGORY_ICONS[cat];
              const count = settings.filter(s => s.category === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  role="tab"
                  aria-selected={activeCategory === cat}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeCategory === cat
                      ? `${CATEGORY_COLORS[cat]} shadow-sm`
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {cat}
                  <span className={`px-2 py-0.5 text-xs rounded-full ${
                    activeCategory === cat ? 'bg-white/30' : 'bg-gray-200 text-gray-600'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Settings Table */}
        <div className="card">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredSettings.length === 0 ? (
            <div className="text-center py-12">
              <div className="p-3 bg-gray-100 rounded-full w-fit mx-auto mb-4">
                {(() => {
                  const Icon = CATEGORY_ICONS[activeCategory];
                  const colorClass = CATEGORY_COLORS[activeCategory].replace('bg-', 'text-').replace('100', '600');
                  return <Icon className={`h-8 w-8 ${colorClass}`} />;
                })()}
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-1">No settings in this category</h3>
              <p className="text-gray-500 mb-4">Click "Add Setting" to create your first setting</p>
              <button onClick={handleNew} className="btn-primary">
                <Plus className="h-4 w-4 mr-2" />
                Add Setting
              </button>
            </div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th className="w-48">Key</th>
                    <th>Value</th>
                    <th className="w-64">Description</th>
                    <th className="w-32">Effective From</th>
                    <th className="w-32">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSettings.map((setting) => {
                    const sensitive = isSensitive(setting.key);
                    const visible = showSensitive[setting.key] || !sensitive;
                    return (
                      <tr key={setting.id}>
                        <td className="font-mono text-sm font-medium">{setting.key}</td>
                        <td className="max-w-xs">
                          <div className="flex items-center gap-2">
                            <code className={`font-mono text-sm ${sensitive ? 'font-mono' : ''} flex-1 truncate`}>
                              {visible ? setting.value : maskValue(setting.key, setting.value)}
                            </code>
                            {sensitive && (
                              <button
                                onClick={() => toggleSensitive(setting.key)}
                                className="p-1 text-gray-500 hover:text-gray-700 rounded hover:bg-gray-100"
                                title={visible ? 'Hide value' : 'Show value'}
                              >
                                {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="text-gray-600 truncate max-w-xs" title={setting.description || ''}>
                          {setting.description || '—'}
                        </td>
                        <td className="text-sm text-gray-500">
                          {setting.effectiveFrom.split('T')[0]}
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleEdit(setting)}
                              className="p-2 text-gray-500 hover:text-primary hover:bg-gray-100 rounded-lg transition-colors"
                              title="Edit"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(setting)}
                              className="p-2 text-gray-500 hover:text-danger hover:bg-gray-100 rounded-lg transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Quick Reference */}
        <div className="card bg-blue-50 border-blue-200">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Database className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-medium text-blue-800">Quick Reference</h3>
              <ul className="text-sm text-blue-700 mt-2 list-disc list-inside space-y-1">
                <li><strong>COMPANY</strong> - Legal entity details, contact info, TPIN, pension fund</li>
                <li><strong>PAYROLL</strong> - Frequency, current period, working days/hours, overtime rate, currency</li>
                <li><strong>STATUTORY</strong> - PAYE tax bands, pension rates, TEVET levy, fringe benefit tax</li>
                <li><strong>SYSTEM</strong> - Default formats, auto-calculate, backup, audit logging</li>
              </ul>
              <p className="text-xs text-blue-600 mt-2">
                All statutory rates are configurable and effective-dated. Changes apply to future payroll runs.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 className="text-xl font-semibold text-gray-900">
                {editingSetting ? 'Edit Setting' : 'Add Setting'}
              </h2>
              <button onClick={handleCloseModal} className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100">
                <XCircle className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="label">Key *</label>
                <input
                  type="text"
                  value={formData.key}
                  onChange={(e) => setFormData({ ...formData, key: e.target.value })}
                  className="input"
                  placeholder="e.g., company_name, statutory.paye_band_1_rate"
                  disabled={!!editingSetting}
                  required
                />
                {formErrors.key && <p className="text-sm text-danger mt-1">{formErrors.key}</p>}
              </div>
              <div>
                <label className="label">Value *</label>
                <input
                  type="text"
                  value={formData.value}
                  onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                  className="input"
                  required
                />
                {formErrors.value && <p className="text-sm text-danger mt-1">{formErrors.value}</p>}
              </div>
              <div>
                <label className="label">Category *</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value as Category })}
                  className="input"
                  required
                >
                  {CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="input"
                  rows={2}
                />
              </div>
              <div>
                <label className="label">Effective From *</label>
                <input
                  type="date"
                  value={formData.effectiveFrom}
                  onChange={(e) => setFormData({ ...formData, effectiveFrom: e.target.value })}
                  className="input"
                  required
                />
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
                <button type="submit" disabled={saving !== null} className="btn-primary">
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Saving...
                    </>
                  ) : (
                    editingSetting ? 'Update' : 'Create'
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

function XCircle({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}