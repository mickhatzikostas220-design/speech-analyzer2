'use client';

// Set-a-new-password page. Reached after clicking the recovery link in the
// email: /auth/callback exchanges the code for a temporary session and sends
// the user here. We confirm that session exists, then call updateUser to set
// the new password and drop the user into their hub.

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function ResetPasswordPage() {
  const supabase = createClient();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    // The recovery link established a session via /auth/callback. If there is
    // none, the link was invalid or expired.
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(Boolean(data.session));
      setChecking(false);
    });
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Use at least 8 characters for your password.');
      return;
    }
    if (password !== confirm) {
      setError('Those passwords don’t match.');
      return;
    }
    setLoading(true);

    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  if (checking) {
    return (
      <div className="card p-6">
        <div className="h-5 w-32 animate-pulse rounded bg-[var(--surface-sunk)]" />
        <div className="mt-4 h-11 w-full animate-pulse rounded bg-[var(--surface-sunk)]" />
      </div>
    );
  }

  if (!hasSession) {
    return (
      <div className="space-y-4">
        <div className="card space-y-3 p-6">
          <h1 className="section-title">This link has expired</h1>
          <p className="text-sm text-muted">
            Your password reset link is invalid or has already been used. Request a fresh one and
            we&rsquo;ll send it right over.
          </p>
          <Link href="/forgot-password" className="btn-primary w-full">
            Send a new link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="card space-y-4 p-6">
        <div>
          <h1 className="section-title" style={{ marginBottom: 2 }}>Set a new password</h1>
          <p className="text-sm text-muted">Pick something you&rsquo;ll remember this time.</p>
        </div>

        {error && (
          <div role="alert" className="rounded-[var(--radius-sm)] bg-[var(--danger-bg)] px-3 py-2 text-sm" style={{ color: 'var(--danger-text)' }}>
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor="reset-password" className="field-label" style={{ marginBottom: 0 }}>New password</label>
          <input
            id="reset-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
            className="input w-full text-sm"
            placeholder="At least 8 characters"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="reset-confirm" className="field-label" style={{ marginBottom: 0 }}>Confirm password</label>
          <input
            id="reset-confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            autoComplete="new-password"
            className="input w-full text-sm"
            placeholder="Re-enter your password"
          />
        </div>

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? 'Saving…' : 'Update password'}
        </button>
      </div>
    </form>
  );
}
