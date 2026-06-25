'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Mail, Lock, Check } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { AuthCard } from '@/components/auth/AuthCard';

const PERKS = ['Neural engagement scoring', 'Clip & script studio', 'Booking inbox'];

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError('Use at least 6 characters for your password.');
      return;
    }
    setLoading(true);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    // If email confirmation is off, we get a session and go straight to setup.
    if (data.session) {
      router.push('/onboarding');
      router.refresh();
    } else {
      router.push(`/verify-email?email=${encodeURIComponent(email)}`);
    }
  }

  return (
    <AuthCard
      railTone="ink"
      rail={
        <div className="flex flex-col gap-3.5">
          {PERKS.map((perk) => (
            <div key={perk} className="flex items-center gap-2.5 text-[12.5px] text-white/80">
              <Check className="h-[15px] w-[15px] shrink-0" style={{ color: 'var(--success)' }} />
              {perk}
            </div>
          ))}
        </div>
      }
    >
      <h1 className="text-2xl font-black tracking-[-0.01em] text-strong">Create your account</h1>
      <p className="mt-1 mb-6 text-sm text-muted">No invite needed — set up your hub in a minute.</p>

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
              placeholder="At least 6 characters"
            />
          </div>
        </div>

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{' '}
        <Link href="/login" className="font-bold" style={{ color: 'var(--text-link)' }}>
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}
