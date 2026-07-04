'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function VerifyEmailPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get('email');
    if (e) setEmail(e);
  }, []);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const token = code.replace(/\s/g, '');
    if (!email.trim()) {
      setError('Enter the email you signed up with.');
      return;
    }
    if (token.length < 6) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    setLoading(true);

    // New signups use a "signup" OTP; fall back to the generic "email" type.
    let result = await supabase.auth.verifyOtp({ email: email.trim(), token, type: 'signup' });
    if (result.error) {
      const retry = await supabase.auth.verifyOtp({ email: email.trim(), token, type: 'email' });
      if (!retry.error) result = retry;
    }

    if (result.error) {
      setError(result.error.message);
      setLoading(false);
      return;
    }

    router.push('/onboarding');
    router.refresh();
  }

  async function resend() {
    if (!email.trim()) {
      setError('Enter your email first.');
      return;
    }
    setResending(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch('/api/auth/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        // Don't claim success on a server error — the user would wait forever for
        // a code that never arrives. Surface the real reason instead.
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Could not resend the code. Please try again.');
      } else {
        setInfo('New code sent — check your inbox.');
      }
    } catch {
      setError('Could not resend the code. Please try again.');
    } finally {
      setResending(false);
    }
  }

  return (
    <form onSubmit={verify} className="space-y-4">
      <div className="card space-y-4 p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--signature)]">
          <svg className="h-6 w-6" style={{ color: 'var(--on-signature)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <h1 className="section-title" style={{ marginBottom: 2 }}>Enter your code</h1>
          <p className="text-sm text-muted">
            We emailed a 6-digit code to verify your account. Pop it in below.
          </p>
        </div>

        {error && (
          <div role="alert" className="rounded-[var(--radius-sm)] bg-[var(--danger-bg)] px-3 py-2 text-sm" style={{ color: 'var(--danger-text)' }}>
            {error}
          </div>
        )}
        {info && (
          <div role="status" className="rounded-[var(--radius-sm)] bg-[var(--success-bg)] px-3 py-2 text-sm" style={{ color: 'var(--success-text)' }}>
            {info}
          </div>
        )}

        <div className="space-y-1.5 text-left">
          <label htmlFor="verify-email" className="field-label" style={{ marginBottom: 0 }}>Email</label>
          <input
            id="verify-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="input w-full text-sm"
            placeholder="you@example.com"
          />
        </div>

        <div className="space-y-1.5 text-left">
          <label htmlFor="verify-code" className="field-label" style={{ marginBottom: 0 }}>Verification code</label>
          <input
            id="verify-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ''))}
            className="input w-full text-center text-lg font-semibold tracking-[0.4em]"
            placeholder="000000"
          />
        </div>

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? 'Verifying…' : 'Verify & continue'}
        </button>

        <button
          type="button"
          onClick={resend}
          disabled={resending}
          className="text-xs font-semibold text-muted transition-colors hover:text-strong"
        >
          {resending ? 'Sending…' : "Didn't get it? Resend code"}
        </button>
      </div>

      <p className="text-center text-sm text-muted">
        <Link href="/login" className="font-semibold" style={{ color: 'var(--text-link)' }}>
          ← Back to sign in
        </Link>
      </p>
    </form>
  );
}
