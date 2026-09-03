'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  Settings, Building2, DollarSign, CreditCard, Shield,
  Loader2, Save, AlertCircle, Plus, Edit, Trash2,
  Eye, EyeOff, Key, Database, Cpu, Globe, Wrench, Table2,
  ChevronDown, ChevronUp, RefreshCw,
} from 'lucide-react';
import { formatCurrency, previewPAYE } from '@/lib/payroll-engine';
import { FbtRuleType, FbtClassification, FringeBenefitType } from '@/lib/fbt-engine';
import { useToast } from '@/hooks/useToast';
import { useCurrentUser } from '@/components/UserContext';

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

const CATEGORIES = ['COMPANY', 'PAYROLL', 'STATUTORY', 'SYSTEM', 'ADVANCED'] as const;
type Category = typeof CATEGORIES[number];

const CATEGORY_ICONS: Record<Category, LucideIcon> = {
  COMPANY: Building2,
  PAYROLL: DollarSign,
  STATUTORY: Shield,
  SYSTEM: Wrench,
  ADVANCED: Table2,
};

const CATEGORY_COLORS: Record<Category, string> = {
  COMPANY: 'bg-blue-100 text-blue-700',
  PAYROLL: 'bg-green-100 text-green-700',
  STATUTORY: 'bg-purple-100 text-purple-700',
  SYSTEM: 'bg-gray-100 text-gray-700',
  ADVANCED: 'bg-orange-100 text-orange-700',
};

type FieldType = 'text' | 'number' | 'select' | 'toggle';

interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  helper?: string;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
}

const COMPANY_FIELDS: FieldDef[] = [
  { key: 'company_name', label: 'Company Name', type: 'text', helper: 'Legal name of your business' },
  { key: 'company_address', label: 'Company Address', type: 'text', helper: 'Registered postal or physical address' },
  { key: 'company_phone', label: 'Company Phone', type: 'text', helper: 'Main contact number' },
  { key: 'company_email', label: 'Company Email', type: 'text', helper: 'Payroll / HR contact email' },
  { key: 'company_tpin', label: 'Tax Identification Number (TPIN)', type: 'text', helper: 'Issued by MRA' },
  { key: 'company_pension_fund', label: 'Default Pension Fund', type: 'text', helper: 'e.g. NICO, Airtel Money, Super Trust' },
];

const PAYROLL_FIELDS: FieldDef[] = [
   { key: 'payroll_frequency', label: 'Payroll Frequency', type: 'select', helper: 'How often you process payroll', options: [
     { value: 'Monthly', label: 'Monthly' },
     { value: 'Bi-weekly', label: 'Bi-weekly' },
     { value: 'Weekly', label: 'Weekly' },
   ]},
   { key: 'current_payroll_period', label: 'Current Payroll Period', type: 'text', helper: 'Format YYYY-MM (e.g. 2026-01)' },
   { key: 'period_start_day', label: 'Period Start Day', type: 'number', helper: 'Day of the month the period starts', min: 1, max: 31 },
   { key: 'period_end_day', label: 'Period End Day', type: 'number', helper: 'Day of the month the period ends', min: 1, max: 31 },
   { key: 'working_hours_per_day', label: 'Working Hours Per Day', type: 'number', helper: 'Standard daily working hours', min: 1, max: 24 },
   { key: 'working_days_per_month', label: 'Working Days Per Month', type: 'number', helper: 'Standard working days per month', min: 1, max: 31 },
   { key: 'overtime_normal_rate_multiplier', label: 'Normal Day Overtime Rate', type: 'number', helper: 'e.g. 1.5 means 1.5× normal hourly pay (minimum 1.5)', min: 1.5, step: 0.1 },
   { key: 'overtime_public_holiday_rate_multiplier', label: 'Public Holiday Overtime Rate', type: 'number', helper: 'e.g. 2.0 means 2.0× normal hourly pay (minimum 2.0)', min: 2.0, step: 0.1 },
   { key: 'overtime_off_day_rate_multiplier', label: 'Off-Day Overtime Rate', type: 'number', helper: 'e.g. 2.0 means 2.0× normal hourly pay (minimum 2.0)', min: 2.0, step: 0.1 },
   { key: 'currency', label: 'Currency', type: 'select', helper: 'Payroll currency', options: [
     { value: 'MWK', label: 'MWK - Malawi Kwacha' },
     { value: 'USD', label: 'USD - US Dollar' },
   ]},
   { key: 'decimal_places', label: 'Decimal Places', type: 'number', helper: 'Rounding precision for calculations', min: 0, max: 4 },
 ];

const PENSION_FIELDS: FieldDef[] = [
  { key: 'statutory.pension_ee_rate', label: 'Employee Pension Rate', type: 'number', helper: 'Employee contribution % of gross salary', min: 0, max: 100, step: 0.1 },
  { key: 'statutory.pension_er_rate', label: 'Employer Pension Rate', type: 'number', helper: 'Employer contribution % of gross salary', min: 0, max: 100, step: 0.1 },
  { key: 'statutory.max_pensionable_income', label: 'Maximum Pensionable Income', type: 'number', helper: 'Income cap for pension calculations (MWK)', min: 0 },
  { key: 'statutory.pension_fund_name', label: 'Pension Fund Name', type: 'text', helper: 'Registered pension fund for remittances' },
];

const OTHER_STATUTORY_FIELDS: FieldDef[] = [
   { key: 'statutory.tevet_levy_rate', label: 'TEVET Levy Rate', type: 'number', helper: 'Employer TEVET levy % of gross salary', min: 0, max: 100, step: 0.1 },
   { key: 'statutory.fringe_benefit_tax_rate', label: 'Fringe Benefit Tax Rate', type: 'number', helper: 'Effective rate applied to fringe-benefit taxable base. Defaults to 30% if not set. Source: Malawi Taxation Act.', min: 0, max: 100, step: 0.1 },
   { key: 'statutory.leave_days_per_year', label: 'Annual Leave Days', type: 'number', helper: 'Standard annual leave entitlement', min: 0, max: 60 },
   { key: 'statutory.sick_days_per_year', label: 'Sick Leave Days', type: 'number', helper: 'Standard annual sick leave entitlement', min: 0, max: 60 },
 ];

const SYSTEM_FIELDS: FieldDef[] = [
  { key: 'default_report_period', label: 'Default Report Period', type: 'text', helper: 'Default range shown on the Reports page' },
  { key: 'number_format', label: 'Number Format', type: 'text', helper: 'e.g. #,##0.00' },
  { key: 'date_format', label: 'Date Format', type: 'text', helper: 'e.g. DD/MM/YYYY' },
  { key: 'auto_calculate', label: 'Auto-Calculate on Change', type: 'toggle', helper: 'Recompute payroll when inputs change' },
  { key: 'backup_enabled', label: 'Enable Auto-Backup', type: 'toggle', helper: 'Create automatic backups of payroll data' },
  { key: 'audit_log_enabled', label: 'Enable Audit Logging', type: 'toggle', helper: 'Log changes to payroll records' }
];

// FBT Rule Types for UI
const FBT_RULE_TYPES = [
  { value: FbtRuleType.PERCENTAGE_OF_COST, label: 'Percentage of Cost' },
  { value: FbtRuleType.PERCENTAGE_OF_SALARY, label: 'Percentage of Salary' },
  { value: FbtRuleType.FIXED_PERCENTAGE, label: 'Fixed Percentage' },
  { value: FbtRuleType.EMPLOYER_COST, label: 'Employer Cost' },
  { value: FbtRuleType.CONCESSIONARY_LOAN, label: 'Concessionary Loan' },
  { value: FbtRuleType.CAPPED_RENTAL, label: 'Capped Rental' },
] as const;

// FBT Benefit Types for UI (excluding excluded ones)
const FBT_BENEFIT_TYPES = [
  { value: FringeBenefitType.HOUSING_EMPLOYER_OWNED, label: 'Housing - Employer Owned' },
  { value: FringeBenefitType.HOUSING_RENTED, label: 'Housing - Rented' },
  { value: FringeBenefitType.MOTOR_VEHICLE, label: 'Motor Vehicle' },
  { value: FringeBenefitType.SCHOOL_FEES, label: 'School Fees' },
  { value: FringeBenefitType.UTILITIES, label: 'Utilities' },
  { value: FringeBenefitType.HOUSEHOLD_ITEMS, label: 'Household Items' },
  { value: FringeBenefitType.VACATION, label: 'Vacation' },
  { value: FringeBenefitType.TRAVEL, label: 'Travel' },
  { value: FringeBenefitType.DOMESTIC_SERVICE, label: 'Domestic Service' },
  { value: FringeBenefitType.AIRTIME_DATA, label: 'Airtime & Data' },
  { value: FringeBenefitType.CONCESSIONARY_LOAN, label: 'Concessionary Loan' },
  { value: FringeBenefitType.OTHER_BENEFIT, label: 'Other Benefit' },
] as const;

// FBT Classification Options for UI
const FBT_CLASSIFICATION_OPTIONS = [
  { value: FbtClassification.FBT, label: 'Fringe Benefit Tax (FBT)' },
  { value: FbtClassification.PAYE_NOT_FBT, label: 'PAYE (Not FBT)' },
  { value: FbtClassification.EXCLUDED, label: 'Excluded' },
] as const;

interface BandRow {
  from: number;
  to: number;
  rate: number;
}

const BAND_START_INDEX = 1;

function deriveBandCount(settingsMap: Record<string, string>): number {
  let maxIdx = 0;
  for (const key of Object.keys(settingsMap)) {
    const m = key.match(/^statutory\.paye_band_(\d+)_(from|to|rate)$/);
    if (m) {
      const idx = parseInt(m[1], 10);
      if (idx > maxIdx) maxIdx = idx;
    }
  }
  return maxIdx > 0 ? maxIdx : 4;
}

function getBandValue(settingsMap: Record<string, string>, band: number, suffix: string, fallback: number): number {
  const raw = settingsMap[`statutory.paye_band_${band}_${suffix}`];
  const parsed = raw === undefined || raw === '' ? NaN : Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bandsFromMap(settingsMap: Record<string, string>): BandRow[] {
  const count = deriveBandCount(settingsMap);
  return Array.from({ length: count }, (_, i) => {
    const band = i + 1;
    const defaults: BandRow[] = [
      { from: 0, to: 170000, rate: 0 },
      { from: 170001, to: 1570000, rate: 30 },
      { from: 1570001, to: 10000000, rate: 35 },
      { from: 10000001, to: 999999999, rate: 40 },
    ];
    const base = defaults[i] ?? { from: Number.MAX_SAFE_INTEGER, to: Number.MAX_SAFE_INTEGER, rate: 0 };
    return {
      from: getBandValue(settingsMap, band, 'from', base.from),
      to: getBandValue(settingsMap, band, 'to', base.to),
      rate: getBandValue(settingsMap, band, 'rate', base.rate),
    };
  });
}

function extractFbtRules(settingsMap: Record<string, string>): Array<{
  id: string;
  benefitType: string;
  version: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  ruleType: string;
  classification: string;
  ruleKey: string;
}> {
  const rules: Array<{
    id: string;
    benefitType: string;
    version: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    ruleType: string;
    classification: string;
    ruleKey: string;
  }> = [];
  
  for (const [key, value] of Object.entries(settingsMap)) {
    if (!key.startsWith('statutory.fbt_rule_')) continue;
    
    try {
      const rule = JSON.parse(value);
      
      // Validate required fields
      if (!rule.benefitType || !rule.version || !rule.effectiveFrom || 
          !rule.valuationRule || !rule.valuationRule.type || !rule.classification) {
        continue;
      }
      
      rules.push({
        id: key, // Using the key as the ID for simplicity
        benefitType: rule.benefitType,
        version: rule.version,
        effectiveFrom: rule.effectiveFrom,
        effectiveTo: rule.effectiveTo ?? null,
        ruleType: rule.valuationRule.type,
        classification: rule.classification,
        ruleKey: key
      });
    } catch (error) {
      // Skip invalid JSON
      continue;
    }
  }
  
  // Sort by effectiveFrom date (newest first)
  return rules.sort((a, b) => 
    new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime()
  );
}

function bandsToMap(bands: BandRow[]): Record<string, string> {
  const map: Record<string, string> = {};
  bands.forEach((band, i) => {
    const n = i + 1;
    map[`statutory.paye_band_${n}_from`] = String(band.from);
    map[`statutory.paye_band_${n}_to`] = String(band.to);
    map[`statutory.paye_band_${n}_rate`] = String(band.rate);
  });
  return map;
}

export default function SettingsPage() {
  const { showToast, Toast } = useToast();
  const user = useCurrentUser();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [accountForm, setAccountForm] = useState({
    email: user?.email ?? '',
    newPassword: '',
    confirmPassword: '',
    currentPassword: '',
  });
  const [accountErrors, setAccountErrors] = useState<Record<string, string>>({});
  const [accountSaving, setAccountSaving] = useState(false);

  if (isSuperAdmin) {
    const validateAccountForm = (): Record<string, string> => {
      const errors: Record<string, string> = {};
      if (!accountForm.email.trim()) {
        errors.email = 'Email is required';
      } else if (!/^\S+@\S+\.\S+$/.test(accountForm.email)) {
        errors.email = 'Enter a valid email address';
      }
      if (!accountForm.currentPassword) {
        errors.currentPassword = 'Current password is required';
      }
      if (accountForm.newPassword) {
        if (accountForm.newPassword.length < 8) errors.newPassword = 'Password must be at least 8 characters';
        else if (!/[A-Z]/.test(accountForm.newPassword)) errors.newPassword = 'Password must contain at least one uppercase letter';
        else if (!/[0-9]/.test(accountForm.newPassword)) errors.newPassword = 'Password must contain at least one number';
        if (accountForm.newPassword !== accountForm.confirmPassword) {
          errors.confirmPassword = 'Passwords do not match';
        }
      }
      return errors;
    };

    const handleAccountSave = async (e: React.FormEvent) => {
      e.preventDefault();
      setAccountErrors({});
      const errors = validateAccountForm();
      if (Object.keys(errors).length > 0) {
        setAccountErrors(errors);
        return;
      }
      setAccountSaving(true);
      try {
        const body: Record<string, string> = { currentPassword: accountForm.currentPassword };
        if (accountForm.email !== user?.email) body.email = accountForm.email;
        if (accountForm.newPassword) body.newPassword = accountForm.newPassword;
        const res = await fetch('/api/auth/account', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!res.ok) {
          showToast(json.error ?? 'Failed to update account');
          return;
        }
        if (accountForm.newPassword) {
          window.location.href = '/login?reset=1';
        } else {
          showToast('Account updated');
          setAccountForm({ email: json.data.email, newPassword: '', confirmPassword: '', currentPassword: '' });
        }
      } catch {
        showToast('A network error occurred. Please try again.');
      } finally {
        setAccountSaving(false);
      }
    };

    return (
      <>
        <div className="p-6 lg:p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <Settings className="h-6 w-6 text-primary" aria-hidden="true" />
            Settings
          </h1>
          <div className="card max-w-2xl">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Account</h2>
            <p className="text-sm text-gray-500 mb-4">Change your email address and password. You will be signed out of all sessions after a password change.</p>
            <form onSubmit={handleAccountSave} className="space-y-4">
              <div>
                <label className="label" htmlFor="acct-email">Email address</label>
                <input
                  id="acct-email"
                  type="email"
                  className={`input ${accountErrors.email ? 'border-red-400' : ''}`}
                  value={accountForm.email}
                  onChange={(e) => setAccountForm({ ...accountForm, email: e.target.value })}
                  aria-invalid={!!accountErrors.email}
                  aria-describedby={accountErrors.email ? 'acct-email-error' : undefined}
                />
                {accountErrors.email && (
                  <p id="acct-email-error" className="mt-1 text-xs text-red-600">{accountErrors.email}</p>
                )}
              </div>

              <div>
                <label className="label" htmlFor="acct-current-password">Current password</label>
                <input
                  id="acct-current-password"
                  type="password"
                  className={`input ${accountErrors.currentPassword ? 'border-red-400' : ''}`}
                  value={accountForm.currentPassword}
                  onChange={(e) => setAccountForm({ ...accountForm, currentPassword: e.target.value })}
                  autoComplete="current-password"
                  aria-invalid={!!accountErrors.currentPassword}
                  aria-describedby={accountErrors.currentPassword ? 'acct-current-error' : undefined}
                />
                {accountErrors.currentPassword && (
                  <p id="acct-current-error" className="mt-1 text-xs text-red-600">{accountErrors.currentPassword}</p>
                )}
              </div>

              <div>
                <label className="label" htmlFor="acct-new-password">New password (leave blank to keep current)</label>
                <input
                  id="acct-new-password"
                  type="password"
                  className={`input ${accountErrors.newPassword ? 'border-red-400' : ''}`}
                  value={accountForm.newPassword}
                  onChange={(e) => setAccountForm({ ...accountForm, newPassword: e.target.value })}
                  autoComplete="new-password"
                  aria-invalid={!!accountErrors.newPassword}
                  aria-describedby={accountErrors.newPassword ? 'acct-new-error' : undefined}
                />
                {accountErrors.newPassword && (
                  <p id="acct-new-error" className="mt-1 text-xs text-red-600">{accountErrors.newPassword}</p>
                )}
              </div>

              <div>
                <label className="label" htmlFor="acct-confirm-password">Confirm new password</label>
                <input
                  id="acct-confirm-password"
                  type="password"
                  className={`input ${accountErrors.confirmPassword ? 'border-red-400' : ''}`}
                  value={accountForm.confirmPassword}
                  onChange={(e) => setAccountForm({ ...accountForm, confirmPassword: e.target.value })}
                  autoComplete="new-password"
                  aria-invalid={!!accountErrors.confirmPassword}
                  aria-describedby={accountErrors.confirmPassword ? 'acct-confirm-error' : undefined}
                />
                {accountErrors.confirmPassword && (
                  <p id="acct-confirm-error" className="mt-1 text-xs text-red-600">{accountErrors.confirmPassword}</p>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <button type="submit" className="btn-primary" disabled={accountSaving}>
                  {accountSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />
                      Saving…
                    </>
                  ) : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
        <Toast />
      </>
    );
  }

  const [settings, setSettings] = useState<Setting[]>([]);
  const [activeCategory, setActiveCategory] = useState<Category>('COMPANY');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [showAdvancedModal, setShowAdvancedModal] = useState(false);
  const [editingSetting, setEditingSetting] = useState<Setting | null>(null);
  const [formData, setFormData] = useState({
    key: '',
    value: '',
    description: '',
    category: 'COMPANY' as Category,
    effectiveFrom: new Date().toISOString().split('T')[0],
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    paye: true,
    pension: true,
    other: true,
    'fbt-rules': true,
  });

  // Local form states per category
  const [companyForm, setCompanyForm] = useState<Record<string, string>>({});
  const [payrollForm, setPayrollForm] = useState<Record<string, string>>({});
  const [pensionForm, setPensionForm] = useState<Record<string, string>>({});
  const [otherStatutoryForm, setOtherStatutoryForm] = useState<Record<string, string>>({});
  const [systemForm, setSystemForm] = useState<Record<string, string>>({});
  const [fbtRulesForm, setFbtRulesForm] = useState<Record<string, string>>({});
  const [bands, setBands] = useState<BandRow[]>([]);

  const settingsMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of settings) map[s.key] = s.value;
    return map;
  }, [settings]);

  const fetchSettings = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Sync local forms when settings change
  useEffect(() => {
    const map: Record<string, string> = {};
    for (const s of settings) map[s.key] = s.value;

    setCompanyForm(prev => {
      const next: Record<string, string> = {};
      COMPANY_FIELDS.forEach(f => { next[f.key] = map[f.key] ?? ''; });
      return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
    });

    setPayrollForm(prev => {
      const next: Record<string, string> = {};
      PAYROLL_FIELDS.forEach(f => { next[f.key] = map[f.key] ?? ''; });
      return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
    });

    setPensionForm(prev => {
      const next: Record<string, string> = {};
      PENSION_FIELDS.forEach(f => { next[f.key] = map[f.key] ?? ''; });
      return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
    });

    setOtherStatutoryForm(prev => {
      const next: Record<string, string> = {};
      OTHER_STATUTORY_FIELDS.forEach(f => { next[f.key] = map[f.key] ?? ''; });
      return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
    });

    setSystemForm(prev => {
      const next: Record<string, string> = {};
      SYSTEM_FIELDS.forEach(f => { next[f.key] = map[f.key] ?? ''; });
      return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
    });

    // Sync FBT rules form - we don't have predefined fields for this as it's dynamic
    // We'll handle FBT rules separately in the render function

    setBands(prev => {
      const next = bandsFromMap(map);
      return prev.length === next.length && prev.every((b, i) => b.from === next[i].from && b.to === next[i].to && b.rate === next[i].rate)
        ? prev
        : next;
    });
  }, [settings]);

  const saveToApi = useCallback(async (category: Category, updates: Record<string, string>) => {
    const entries = Object.entries(updates);
    const payload = entries.map(([key, value]) => ({ key, value, category }));
    const res = await fetch('/api/settings/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Batch save failed');
    }
    await fetchSettings();
  }, [fetchSettings]);

  const handleDelete = useCallback(async (key: string) => {
    if (!confirm(`Delete setting "${key}"?`)) return;
    try {
      const res = await fetch(`/api/settings?key=${encodeURIComponent(key)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setSettings(prev => prev.filter(s => s.key !== key));
        showToast(`Deleted "${key}"`);
      } else {
        showToast(data.error || 'Delete failed');
      }
    } catch {
      showToast('Network error');
    }
  }, [showToast]);

  const handleAdvancedSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveToApi(formData.category, { [formData.key]: formData.value });
      setShowAdvancedModal(false);
      setEditingSetting(null);
      setFormData({ key: '', value: '', description: '', category: activeCategory, effectiveFrom: new Date().toISOString().split('T')[0] });
      showToast('Setting saved');
    } catch {
      showToast('Save failed');
    }
  };

  const handleAdvancedEdit = (setting: Setting) => {
    setEditingSetting(setting);
    setFormData({
      key: setting.key,
      value: setting.value,
      description: setting.description || '',
      category: setting.category as Category,
      effectiveFrom: setting.effectiveFrom.split('T')[0],
    });
    setShowAdvancedModal(true);
  };

  const filteredSettings = settings.filter(s => s.category === activeCategory);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const SectionHeader = ({ id, title, defaultOpen = true }: { id: string; title: string; defaultOpen?: boolean }) => (
    <button
      type="button"
      onClick={() => toggleSection(id)}
      className="flex items-center justify-between w-full py-3 text-left font-medium text-gray-900 hover:text-primary transition-colors"
    >
      <span>{title}</span>
      {expandedSections[id] !== false ? (
        <ChevronUp className="h-4 w-4 text-gray-400" />
      ) : (
        <ChevronDown className="h-4 w-4 text-gray-400" />
      )}
    </button>
  );

  const renderField = (field: FieldDef, value: string, onChange: (val: string) => void) => {
    switch (field.type) {
      case 'select':
        return (
          <select value={value} onChange={e => onChange(e.target.value)} className="input">
            {field.options?.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        );
      case 'toggle':
        return (
          <button
            type="button"
            onClick={() => onChange(value === 'true' ? 'false' : 'true')}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${value === 'true' ? 'bg-primary' : 'bg-gray-200'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${value === 'true' ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        );
      case 'number':
        return (
          <input
            type="number"
            value={value}
            onChange={e => onChange(e.target.value)}
            className="input"
            min={field.min}
            max={field.max}
            step={field.step || 1}
          />
        );
      default:
        return (
          <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            className="input"
          />
        );
    }
  };

  const renderCompanyForm = () => (
    <div className="space-y-4">
      {COMPANY_FIELDS.map(field => (
        <div key={field.key}>
          <label className="label">{field.label}</label>
          {renderField(field, companyForm[field.key] ?? '', (val) => setCompanyForm(prev => ({ ...prev, [field.key]: val })))}
          {field.helper && <p className="text-xs text-gray-500 mt-1">{field.helper}</p>}
        </div>
      ))}
      <div className="pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={async () => {
              const updates: Record<string, string> = {};
              COMPANY_FIELDS.forEach(f => { if (companyForm[f.key] !== undefined) updates[f.key] = companyForm[f.key]; });
              try {
                await saveToApi('COMPANY', updates);
                showToast('Company settings saved');
              } catch (e) {
                showToast(e instanceof Error ? e.message : 'Save failed');
              }
            }}
            disabled={saving === 'COMPANY'}
            className="btn-primary"
          >
          {saving === 'COMPANY' ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...</>
          ) : (
            <><Save className="h-4 w-4 mr-2" /> Save Company Settings</>
          )}
        </button>
      </div>
    </div>
  );

  const renderPayrollForm = () => (
    <div className="space-y-4">
      {PAYROLL_FIELDS.map(field => (
        <div key={field.key}>
          <label className="label">{field.label}</label>
          {renderField(field, payrollForm[field.key] ?? '', (val) => setPayrollForm(prev => ({ ...prev, [field.key]: val })))}
          {field.helper && <p className="text-xs text-gray-500 mt-1">{field.helper}</p>}
        </div>
      ))}
      <div className="pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={async () => {
              const updates: Record<string, string> = {};
              PAYROLL_FIELDS.forEach(f => { if (payrollForm[f.key] !== undefined) updates[f.key] = payrollForm[f.key]; });
              try {
                await saveToApi('PAYROLL', updates);
                showToast('Payroll settings saved');
              } catch (e) {
                showToast(e instanceof Error ? e.message : 'Save failed');
              }
            }}
            disabled={saving === 'PAYROLL'}
            className="btn-primary"
          >
          {saving === 'PAYROLL' ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...</>
          ) : (
            <><Save className="h-4 w-4 mr-2" /> Save Payroll Settings</>
          )}
        </button>
      </div>
    </div>
  );

  const renderStatutoryForm = () => {
    const previewBands = bands;
    const previewIncomes = [500000, 1000000, 2000000, 5000000, 10000000, 15000000];
    const previewTaxes = previewIncomes.map(inc => previewPAYE(inc, previewBands));

    const updateBand = (index: number, field: keyof BandRow, value: number) => {
      setBands(prev => {
        const next = [...prev];
        next[index] = { ...next[index], [field]: value };
        return next;
      });
    };

    const addBand = () => {
      const newBand: BandRow = { from: bands[bands.length - 1].to + 1, to: 999999999, rate: 40 };
      setBands(prev => [...prev, newBand]);
    };

    const removeBand = (index: number) => {
      if (bands.length <= 1) return;
      setBands(prev => prev.filter((_, i) => i !== index));
    };

    return (
      <div className="space-y-6">
        {/* PAYE Tax Bands */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
            <SectionHeader id="paye" title="PAYE Tax Bands (effective 2026-01-01)" />
          </div>
          {expandedSections.paye !== false && (
            <div className="p-4 space-y-4">
              <p className="text-sm text-gray-600">
                Define the income ranges and tax rates for PAYE calculations. Leave the upper limit of the last band empty to mean "and above".
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-2 font-medium text-gray-700">Band</th>
                      <th className="text-left py-2 px-2 font-medium text-gray-700">From (MWK)</th>
                      <th className="text-left py-2 px-2 font-medium text-gray-700">To (MWK)</th>
                      <th className="text-left py-2 px-2 font-medium text-gray-700">Rate (%)</th>
                      <th className="w-16"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {bands.map((band, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="py-2 px-2 text-gray-600">{i + 1}</td>
                        <td className="py-2 px-2">
                          <input
                            type="number"
                            value={band.from}
                            onChange={e => updateBand(i, 'from', Number(e.target.value))}
                            className="input text-sm"
                            disabled={i === 0}
                          />
                        </td>
                        <td className="py-2 px-2">
                          {i === bands.length - 1 ? (
                            <span className="text-sm text-gray-500 italic">and above</span>
                          ) : (
                            <input
                              type="number"
                              value={band.to}
                              onChange={e => updateBand(i, 'to', Number(e.target.value))}
                              className="input text-sm"
                            />
                          )}
                        </td>
                        <td className="py-2 px-2">
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              value={band.rate}
                              onChange={e => updateBand(i, 'rate', Number(e.target.value))}
                              className="input text-sm w-20"
                              min={0}
                              max={100}
                            />
                            <span className="text-gray-500">%</span>
                          </div>
                        </td>
                        <td className="py-2 px-2">
                          {bands.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeBand(i)}
                              className="text-danger hover:text-red-700 p-1"
                              title="Remove band"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={addBand}
                  className="btn-secondary text-sm"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Band
                </button>
              </div>

              {/* Live Preview */}
              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h4 className="text-sm font-medium text-blue-800 mb-2">Live PAYE Preview</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-blue-200">
                        <th className="text-left py-1 px-2 text-blue-700 font-medium">Gross (MWK)</th>
                        {previewIncomes.map(inc => (
                          <th key={inc} className="text-right py-1 px-2 text-blue-700 font-medium">
                            {inc >= 1000000 ? `${(inc / 1000000).toFixed(0)}M` : `${(inc / 1000).toFixed(0)}K`}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="py-1 px-2 text-blue-600">PAYE</td>
                        {previewTaxes.map(tax => (
                          <td key={tax} className="text-right py-1 px-2 text-blue-900 font-mono">
                            {formatCurrency(tax)}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Pension */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
            <SectionHeader id="pension" title="Pension" />
          </div>
          {expandedSections.pension !== false && (
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              {PENSION_FIELDS.map(field => (
                <div key={field.key}>
                  <label className="label">{field.label}</label>
                  {renderField(field, pensionForm[field.key] ?? '', (val) => setPensionForm(prev => ({ ...prev, [field.key]: val })))}
                  {field.helper && <p className="text-xs text-gray-500 mt-1">{field.helper}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

{/* Other Statutory */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
            <SectionHeader id="other" title="Other Statutory Items" />
          </div>
          {expandedSections.other !== false && (
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              {OTHER_STATUTORY_FIELDS.map(field => (
                <div key={field.key}>
                  <label className="label">{field.label}</label>
                  {renderField(field, otherStatutoryForm[field.key] ?? '', (val) => setOtherStatutoryForm(prev => ({ ...prev, [field.key]: val })))}
                  {field.helper && <p className="text-xs text-gray-500 mt-1">{field.helper}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* FBT Rules */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
            <SectionHeader id="fbt-rules" title="FBT Benefit Rules" />
          </div>
          {expandedSections['fbt-rules'] !== false && (
            <div className="p-4">
              <div className="space-y-4">
                {/* FBT Rules Table */}
                <div className="overflow-x-auto">
                  <table className="w-full table">
                    <thead>
                      <tr>
                        <th className="text-left py-2 px-2 font-medium text-gray-700">Benefit Type</th>
                        <th className="text-left py-2 px-2 font-medium text-gray-700">Version</th>
                        <th className="text-left py-2 px-2 font-medium text-gray-700">Effective From</th>
                        <th className="text-left py-2 px-2 font-medium text-gray-700">Effective To</th>
                        <th className="text-left py-2 px-2 font-medium text-gray-700">Rule Type</th>
                        <th className="text-left py-2 px-2 font-medium text-gray-700">Classification</th>
                        <th className="text-center py-2 px-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {extractFbtRules(settingsMap).map((rule) => (
                        <tr key={rule.id} className="border-b border-gray-100">
                          <td className="py-2 px-2 text-gray-600">
                            {FBT_BENEFIT_TYPES.find(bt => bt.value === rule.benefitType)?.label || rule.benefitType}
                          </td>
                          <td className="py-2 px-2 text-gray-600">{rule.version}</td>
                          <td className="py-2 px-2 text-gray-600">
                            {new Date(rule.effectiveFrom).toLocaleDateString()}
                          </td>
                          <td className="py-2 px-2 text-gray-600">
                            {rule.effectiveTo ? (
                              <span>
                                {new Date(rule.effectiveTo).toLocaleDateString()}
                              </span>
                            ) : (
                              <span className="text-sm text-gray-500 italic">ongoing</span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-gray-600">
                            {FBT_RULE_TYPES.find(rt => rt.value === rule.ruleType)?.label || rule.ruleType}
                          </td>
                          <td className="py-2 px-2 text-gray-600">
                            {FBT_CLASSIFICATION_OPTIONS.find(fc => fc.value === rule.classification)?.label || rule.classification}
                          </td>
                          <td className="py-2 px-2">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  const setting = settings.find(s => s.key === rule.ruleKey);
                                  if (setting) {
                                    handleAdvancedEdit(setting);
                                  }
                                }}
                                className="btn-icon hover:text-primary"
                                title="Edit"
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDelete(rule.ruleKey)}
                                className="btn-icon hover:text-danger"
                                title="Delete"
                                aria-label={`Delete ${rule.ruleKey}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {/* Show placeholder if no rules */}
                      {extractFbtRules(settingsMap).length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-4 text-center text-gray-500">
                            No FBT rules configured. Add rules using the "+ Add Setting" button in Advanced mode.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                
                {/* Add FBT Rule Button */}
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingSetting(null);
                      setFormData({
                        key: '',
                        value: '',
                        description: '',
                        category: 'STATUTORY' as Category,
                        effectiveFrom: new Date().toISOString().split('T')[0],
                      });
                      setShowAdvancedModal(true);
                    }}
                    className="btn-primary"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add FBT Rule
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={async () => {
              const updates = { ...bandsToMap(bands) };
              PENSION_FIELDS.forEach(f => { if (pensionForm[f.key] !== undefined) updates[f.key] = pensionForm[f.key]; });
              OTHER_STATUTORY_FIELDS.forEach(f => { if (otherStatutoryForm[f.key] !== undefined) updates[f.key] = otherStatutoryForm[f.key]; });
              try {
                await saveToApi('STATUTORY', updates);
                showToast('Statutory settings saved');
              } catch (e) {
                showToast(e instanceof Error ? e.message : 'Save failed');
              }
            }}
            disabled={saving === 'STATUTORY'}
            className="btn-primary"
          >
            {saving === 'STATUTORY' ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...</>
            ) : (
              <><Save className="h-4 w-4 mr-2" /> Save Statutory Settings</>
            )}
          </button>
        </div>
      </div>
    );
  };

  const renderSystemForm = () => (
    <div className="space-y-4">
      {SYSTEM_FIELDS.map(field => (
        <div key={field.key}>
          <label className="label">{field.label}</label>
          {renderField(field, systemForm[field.key] ?? '', (val) => setSystemForm(prev => ({ ...prev, [field.key]: val })))}
          {field.helper && <p className="text-xs text-gray-500 mt-1">{field.helper}</p>}
        </div>
      ))}
      <div className="pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={async () => {
              const updates: Record<string, string> = {};
              SYSTEM_FIELDS.forEach(f => { if (systemForm[f.key] !== undefined) updates[f.key] = systemForm[f.key]; });
              try {
                await saveToApi('SYSTEM', updates);
                showToast('System settings saved');
              } catch (e) {
                showToast(e instanceof Error ? e.message : 'Save failed');
              }
            }}
            disabled={saving === 'SYSTEM'}
            className="btn-primary"
          >
          {saving === 'SYSTEM' ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...</>
          ) : (
            <><Save className="h-4 w-4 mr-2" /> Save System Settings</>
          )}
        </button>
      </div>
    </div>
  );

  const renderAdvancedTable = () => (
    <div className="space-y-4">
      <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-orange-600 mt-0.5" />
          <div>
            <h3 className="font-medium text-orange-800">Advanced Mode</h3>
            <p className="text-sm text-orange-700 mt-1">
              Editing raw settings directly can break payroll calculations if keys are misspelled. Prefer the category tabs above. Only use this tab if you know the exact setting key.
            </p>
          </div>
        </div>
      </div>

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
              const sensitive = ['password', 'secret', 'key', 'token', 'tpin'].some(k => setting.key.toLowerCase().includes(k));
              return (
                <tr key={setting.id}>
                  <td className="font-mono text-sm font-medium">{setting.key}</td>
                  <td className="max-w-xs">
                    <div className="flex items-center gap-2">
                      <code className="font-mono text-sm flex-1 truncate">{sensitive ? '•'.repeat(12) : setting.value}</code>
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
                        onClick={() => handleAdvancedEdit(setting)}
                        className="btn-icon hover:text-primary"
                        title="Edit"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(setting.key)}
                        className="btn-icon hover:text-danger"
                        title="Delete"
                        aria-label={`Delete ${setting.key}`}
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
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-xl font-bold text-primary">WizTech Payroll</Link>
            <span className="text-gray-500">/</span>
            <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
          </div>
          {activeCategory !== 'ADVANCED' && (
            <button
              onClick={() => {
                setEditingSetting(null);
                setFormData({ key: '', value: '', description: '', category: activeCategory, effectiveFrom: new Date().toISOString().split('T')[0] });
                setShowAdvancedModal(true);
              }}
              className="btn-primary"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Setting
            </button>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* Category Tabs */}
        <div className="card mb-6">
          <div className="flex flex-wrap gap-1" role="tablist">
            {CATEGORIES.map((cat) => {
              const Icon = CATEGORY_ICONS[cat];
              const count = cat === 'ADVANCED' ? settings.length : settings.filter(s => s.category === cat).length;
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

        {/* Content */}
        <div className="card">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : activeCategory === 'COMPANY' ? (
            renderCompanyForm()
          ) : activeCategory === 'PAYROLL' ? (
            renderPayrollForm()
          ) : activeCategory === 'STATUTORY' ? (
            renderStatutoryForm()
          ) : activeCategory === 'SYSTEM' ? (
            renderSystemForm()
          ) : (
            renderAdvancedTable()
          )}
        </div>

        {/* Toast */}
        <Toast />
      </main>

      {/* Advanced Modal */}
      {showAdvancedModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={(e) => { if (e.target === e.currentTarget) setShowAdvancedModal(false); }}
          onKeyDown={(e) => { if (e.key === 'Escape') setShowAdvancedModal(false); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="settingModalTitle"
            aria-label="Setting form"
            className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
          >
            <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 id="settingModalTitle" className="text-xl font-semibold text-gray-900">
                {editingSetting ? 'Edit Setting' : 'Add Setting'}
              </h2>
              <button onClick={() => setShowAdvancedModal(false)} autoFocus className="btn-icon" aria-label="Close">
                <XCircle className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleAdvancedSave} className="p-6 space-y-4">
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
                  {CATEGORIES.filter(c => c !== 'ADVANCED').map(cat => (
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
                <button type="button" onClick={() => setShowAdvancedModal(false)} className="btn-secondary">
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
      <Toast />
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
