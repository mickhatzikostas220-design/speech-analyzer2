'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';
import { DEFAULT_BRAND } from '@/lib/brand/defaults';

export default function RequestAccessPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch('/api/request-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, reason }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? 'Something went wrong. Please try again.');
      setLoading(false);
      return;
    }

    router.push('/request-access/success');
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-page px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo brand={DEFAULT_BRAND} size={22} />
        </div>

        <div className="card p-6 sm:p-8">
          <h1 className="section-title" style={{ marginBottom: 2 }}>Request access</h1>
          <p className="mb-6 text-sm text-muted">
            Tell us a bit about yourself and we&apos;ll be in touch.
          </p>

          {error && (
            <div className="mb-4 rounded-[var(--radius-sm)] bg-[var(--danger-bg)] px-3 py-2 text-sm" style={{ color: 'var(--danger)' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="field-label" style={{ marginBottom: 0 }}>Full name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Your name"
                className="input w-full text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="field-label" style={{ marginBottom: 0 }}>Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="input w-full text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="field-label" style={{ marginBottom: 0 }}>What are you hoping to do?</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                rows={4}
                placeholder="Tell us about your speaking and what you'd like to improve…"
                className="input w-full resize-none text-sm"
              />
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Submitting…' : 'Request access'}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-sm text-muted">
          Already have an account?{' '}
          <Link href="/login" className="font-semibold" style={{ color: 'var(--text-link)' }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
