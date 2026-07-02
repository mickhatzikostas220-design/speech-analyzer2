'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

// Map raw Supabase / callback error codes to messages a person can act on.
function friendlyError(message: string): string {
  if (/invalid login credentials/i.test(message)) {
    return 'Wrong email or password. Check both and try again.';
  }
  if (/email not confirmed/i.test(message)) {
    return 'Your email isn’t verified yet. Check your inbox for the code we sent you.';
  }
  return message;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Surface errors passed back from /auth/callback (expired invite links etc.).
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('error');
    if (code === 'link_expired') {
      setError('That sign-in link has expired or was already used. Sign in below, or request a new link.');
    } else if (code === 'missing_code') {
      setError('That sign-in link was incomplete. Try signing in below.');
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Created here (not at component scope) so the page can prerender without
    // Supabase env vars at build time.
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError(friendlyError(signInError.message));
      setLoading(false);
      return;
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
              Forgot password?
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
