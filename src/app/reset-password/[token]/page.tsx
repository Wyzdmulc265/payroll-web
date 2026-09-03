'use client';

import { useState, type FormEvent, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Building2, Eye, EyeOff, Save, ShieldAlert } from 'lucide-react';

export default function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const router = useRouter();
  const { token } = use(params);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Client-side strength check
  function validatePassword(pass: string): Record<string, string> {
    const errs: Record<string, string> = {};
    if (!pass) {
      errs.password = 'Password is required';
    } else {
      if (pass.length < 8) errs.password = 'Must be at least 8 characters';
      else if (!/[A-Z]/.test(pass)) errs.password = 'Must contain at least one uppercase letter';
      else if (!/[0-9]/.test(pass)) errs.password = 'Must contain at least one number';
    }
    return errs;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    
    const errs = validatePassword(password);
    if (password !== confirm) {
      errs.confirm = 'Passwords do not match';
    }
    
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});

    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const json = await res.json();
      
      if (!res.ok || !json.success) {
        setServerError(json.error ?? 'Failed to reset password. The link may have expired.');
        return;
      }
      
      // Success
      router.push('/login?reset=1');
    } catch {
      setServerError('A network error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary shadow-lg mb-4">
            <Building2 className="h-7 w-7 text-white" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">WizTech Payroll</h1>
          <p className="text-sm text-gray-500 mt-1">Malawi Payroll Management</p>
        </div>

        <div className="card shadow-xl border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Create new password</h2>
          <p className="text-sm text-gray-500 mb-6">
            Your new password must be at least 8 characters long and contain at least one uppercase letter and one number.
          </p>

          {serverError && (
            <div className="mb-6 rounded-lg bg-red-50 border border-red-200 p-4">
              <div className="flex items-start gap-3">
                <ShieldAlert className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-medium text-red-800">Cannot reset password</h3>
                  <p className="mt-1 text-sm text-red-700">{serverError}</p>
                  <div className="mt-3">
                    <Link href="/forgot-password" className="text-sm font-medium text-red-800 hover:text-red-900 underline">
                      Request a new reset link
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            {/* New Password */}
            <div className="mb-4">
              <label htmlFor="reset-password" className="label">New password</label>
              <div className="relative">
                <input
                  id="reset-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`input pr-10 ${fieldErrors.password ? 'border-red-400' : ''}`}
                  aria-invalid={!!fieldErrors.password}
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {fieldErrors.password && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.password}</p>
              )}
            </div>

            {/* Confirm Password */}
            <div className="mb-6">
              <label htmlFor="reset-confirm" className="label">Confirm password</label>
              <input
                id="reset-confirm"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={`input ${fieldErrors.confirm ? 'border-red-400' : ''}`}
                aria-invalid={!!fieldErrors.confirm}
                disabled={loading}
              />
              {fieldErrors.confirm && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.confirm}</p>
              )}
            </div>

            <button
              type="submit"
              className="btn-primary w-full flex items-center justify-center gap-2"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Saving…
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save new password
                </>
              )}
            </button>
          </form>
          
          <div className="mt-6 text-center">
             <Link href="/login" className="text-sm text-primary hover:text-primary-hover font-medium">
               Cancel and return to sign in
             </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
