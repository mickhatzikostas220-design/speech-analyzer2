'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { isTesterEmail, TESTER_RESET_FLAG } from '@/lib/tester';
import GoogleAuthButton from '@/components/GoogleAuthButton';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    // The tester demo account is meant to feel brand-new on every login, so
    // wipe its data before we land it in the app. We await this so the app
    // never renders with stale data from a previous session. Setting the guard
    // flag stops <TesterFreshStart /> from wiping a second time on this visit.
    // The endpoint is a no-op / 403 for every other account, so this only
    // affects the tester.
    if (isTesterEmail(email)) {
      await fetch('/api/tester/reset', { method: 'POST' });
      sessionStorage.setItem(TESTER_RESET_FLAG, '1');
    }

    router.push('/dashboard');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="card space-y-4 p-6">
        <h1 className="section-title">Sign in</h1>

        {error && (
          <div className="rounded-[var(--radius-sm)] bg-[var(--danger-bg)] px-3 py-2 text-sm" style={{ color: 'var(--danger)' }}>
            {error}
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
            className="input w-full text-sm"
            placeholder="you@example.com"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="field-label" style={{ marginBottom: 0 }}>Password</label>
            <Link href="/forgot-password" className="text-xs font-semibold" style={{ color: 'var(--text-link)' }}>
              Forgot?
            </Link>
          </div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="input w-full text-sm"
            placeholder="••••••••"
          />
        </div>

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? 'Signing in…' : 'Sign in'}
        </button>

        <GoogleAuthButton label="Sign in with Google" onError={setError} />
      </div>

      <p className="text-center text-sm text-muted">
        No account?{' '}
        <Link href="/signup" className="font-semibold" style={{ color: 'var(--text-link)' }}>
          Sign up
        </Link>
      </p>
    </form>
  );
}
