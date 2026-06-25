'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Mail, Lock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { AuthCard } from '@/components/auth/AuthCard';

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
    <AuthCard
      railTone="signature"
      rail={
        <div>
          <p className="script mb-2.5 text-3xl" style={{ color: 'var(--yellow)' }}>
            Welcome back.
          </p>
          <p className="text-[13px] leading-relaxed text-white/70">
            Every tool a speaker needs, in one place.
          </p>
        </div>
      }
    >
      <h1 className="mb-6 text-2xl font-black tracking-[-0.01em] text-strong">Sign in</h1>

      <form onSubmit={handleSubmit} className="space-y-[18px]">
        {error && (
          <div
            className="rounded-[var(--radius-sm)] bg-[var(--danger-bg)] px-3 py-2 text-sm"
            style={{ color: 'var(--danger)' }}
          >
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="field-label" style={{ marginBottom: 0 }}>
            Email
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-faint" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="input w-full text-sm"
              style={{ paddingLeft: 42 }}
              placeholder="you@example.com"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="field-label" style={{ marginBottom: 0 }}>
            Password
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-faint" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="input w-full text-sm"
              style={{ paddingLeft: 42 }}
              placeholder="••••••••"
            />
          </div>
        </div>

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        No account?{' '}
        <Link href="/signup" className="font-bold" style={{ color: 'var(--text-link)' }}>
          Sign up
        </Link>
      </p>
    </AuthCard>
  );
}
