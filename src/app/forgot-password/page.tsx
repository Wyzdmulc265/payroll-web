'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Building2, ArrowLeft, Mail } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setEmailError('');
    setServerError(null);

    const trimmed = email.trim().toLowerCase();
    if (!trimmed) { setEmailError('Email is required'); return; }
    if (!/^\S+@\S+\.\S+$/.test(trimmed)) { setEmailError('Enter a valid email address'); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setServerError(json.error ?? 'Something went wrong. Please try again.');
        return;
      }
      setSubmitted(true);
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
          {submitted ? (
            /* Success state */
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 mb-4">
                <Mail className="h-6 w-6 text-green-600" aria-hidden="true" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Check your inbox</h2>
              <p className="text-sm text-gray-500 mb-6">
                If an account exists for <strong>{email.trim().toLowerCase()}</strong>, reset
                instructions have been sent. Check your spam folder if you don't see it.
              </p>
              <Link href="/login" className="btn-primary inline-flex items-center gap-2">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back to sign in
              </Link>
            </div>
          ) : (
            /* Form state */
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Reset your password</h2>
              <p className="text-sm text-gray-500 mb-6">
                Enter your email address and we&apos;ll send you a link to reset your password.
              </p>

              {serverError && (
                <div role="alert" className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {serverError}
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate>
                <div className="mb-6">
                  <label htmlFor="fp-email" className="label">Email address</label>
                  <input
                    id="fp-email"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`input ${emailError ? 'border-red-400' : ''}`}
                    aria-invalid={!!emailError}
                    aria-describedby={emailError ? 'fp-email-error' : undefined}
                    disabled={loading}
                    placeholder="you@example.com"
                  />
                  {emailError && (
                    <p id="fp-email-error" className="mt-1 text-xs text-red-600">{emailError}</p>
                  )}
                </div>

                <button
                  id="fp-submit"
                  type="submit"
                  className="btn-primary w-full flex items-center justify-center gap-2"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden="true" />
                      Sending…
                    </>
                  ) : (
                    <>
                      <Mail className="h-4 w-4" aria-hidden="true" />
                      Send reset link
                    </>
                  )}
                </button>
              </form>

              <div className="mt-4 text-center">
                <Link href="/login" className="text-sm text-primary hover:text-primary-hover font-medium inline-flex items-center gap-1">
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  Back to sign in
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
