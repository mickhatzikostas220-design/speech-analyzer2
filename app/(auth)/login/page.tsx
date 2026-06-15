'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

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
            className="input w-full text-sm"
            placeholder="you@example.com"
          />
        </div>

        <div className="space-y-1.5">
          <label className="field-label" style={{ marginBottom: 0 }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
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
