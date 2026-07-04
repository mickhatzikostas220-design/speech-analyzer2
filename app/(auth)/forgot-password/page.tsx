'use client';

// Forgot-password page. Sends a Supabase password-recovery email whose link
// returns to /auth/callback?next=/reset-password, where the user sets a new
// password. Kept intentionally quiet about whether an email exists (we always
// show the same "check your inbox" confirmation) to avoid leaking accounts.

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });

    setLoading(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <div className="card space-y-3 p-6">
          <h1 className="section-title">Check your email</h1>
          <p className="text-sm text-muted">
            If an account exists for <span className="font-semibold text-strong">{email.trim()}</span>,
            we&rsquo;ve sent a link to reset your password. It expires in about an hour.
          </p>
          <p className="text-sm text-muted">
            Didn&rsquo;t get it? Check your spam folder, or{' '}
            <button
              type="button"
              onClick={() => setSent(false)}
              className="font-semibold"
              style={{ color: 'var(--text-link)' }}
            >
              try a different email
            </button>
            .
          </p>
        </div>
        <p className="text-center text-sm text-muted">
          <Link href="/login" className="font-semibold" style={{ color: 'var(--text-link)' }}>
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="card space-y-4 p-6">
        <div>
          <h1 className="section-title" style={{ marginBottom: 2 }}>Reset your password</h1>
          <p className="text-sm text-muted">
            Enter your email and we&rsquo;ll send you a link to set a new one.
          </p>
        </div>

        {error && (
          <div role="alert" className="rounded-[var(--radius-sm)] bg-[var(--danger-bg)] px-3 py-2 text-sm" style={{ color: 'var(--danger-text)' }}>
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor="forgot-email" className="field-label" style={{ marginBottom: 0 }}>Email</label>
          <input
            id="forgot-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="input w-full text-sm"
            placeholder="you@example.com"
          />
        </div>

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? 'Sending…' : 'Send reset link'}
        </button>
      </div>

      <p className="text-center text-sm text-muted">
        Remembered it?{' '}
        <Link href="/login" className="font-semibold" style={{ color: 'var(--text-link)' }}>
          Sign in
        </Link>
      </p>
    </form>
  );
}
