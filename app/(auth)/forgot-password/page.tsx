'use client';

// Password reset page. Step 1: request a 6-digit recovery code (delivered via
// Resend by /api/auth/forgot). Step 2: verify the code (Supabase recovery OTP)
// and set a new password, then continue straight into the app.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function requestCode(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    setInfo(null);
    if (!email.trim()) {
      setError('Enter your email first.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not send the code. Please try again.');
        setLoading(false);
        return;
      }
      setStep('reset');
      setInfo('If an account exists for that email, a 6-digit code is on its way.');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const token = code.replace(/\s/g, '');
    if (token.length < 6) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    if (password.length < 8) {
      setError('Use at least 8 characters for your new password.');
      return;
    }
    setLoading(true);

    // Created here (not at component scope) so the page can prerender without
    // Supabase env vars at build time.
    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token,
      type: 'recovery',
    });
    if (verifyError) {
      setError('That code is wrong or has expired. Request a new one and try again.');
      setLoading(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  return (
    <form onSubmit={step === 'request' ? requestCode : resetPassword} className="space-y-4">
      <div className="card space-y-4 p-6">
        <div>
          <h1 className="section-title" style={{ marginBottom: 2 }}>Reset your password</h1>
          <p className="text-sm text-muted">
            {step === 'request'
              ? "Enter your email and we'll send you a 6-digit code."
              : 'Enter the code from your email and choose a new password.'}
          </p>
        </div>

        {error && (
          <div className="rounded-[var(--radius-sm)] bg-[var(--danger-bg)] px-3 py-2 text-sm" style={{ color: 'var(--danger)' }}>
            {error}
          </div>
        )}
        {info && (
          <div className="rounded-[var(--radius-sm)] bg-[var(--success-bg)] px-3 py-2 text-sm" style={{ color: 'var(--success)' }}>
            {info}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="field-label" style={{ marginBottom: 0 }}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            disabled={step === 'reset'}
            className="input w-full text-sm"
            placeholder="you@example.com"
          />
        </div>

        {step === 'reset' && (
          <>
            <div className="space-y-1.5">
              <label className="field-label" style={{ marginBottom: 0 }}>Reset code</label>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ''))}
                className="input w-full text-center text-lg font-semibold tracking-[0.4em]"
                placeholder="000000"
              />
            </div>

            <div className="space-y-1.5">
              <label className="field-label" style={{ marginBottom: 0 }}>New password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="input w-full text-sm"
                placeholder="At least 8 characters"
              />
            </div>
          </>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading
            ? step === 'request' ? 'Sending…' : 'Resetting…'
            : step === 'request' ? 'Send reset code' : 'Reset password & sign in'}
        </button>

        {step === 'reset' && (
          <button
            type="button"
            onClick={() => requestCode()}
            disabled={loading}
            className="text-xs font-semibold text-muted transition-colors hover:text-strong"
          >
            Didn&apos;t get it? Resend code
          </button>
        )}
      </div>

      <p className="text-center text-sm text-muted">
        <Link href="/login" className="font-semibold" style={{ color: 'var(--text-link)' }}>
          ← Back to sign in
        </Link>
      </p>
    </form>
  );
}
