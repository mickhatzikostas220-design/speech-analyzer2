'use client';

import { useState } from 'react';

export function BillingActions({ isPro }: { isPro: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Both buttons hit a billing route that returns a Stripe URL to redirect to.
  async function go(path: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(path, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || 'Something went wrong.');
        setLoading(false);
      }
    } catch {
      setError('Network error.');
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        className="btn-primary"
        disabled={loading}
        onClick={() => go(isPro ? '/api/billing/portal' : '/api/billing/checkout')}
      >
        {loading ? 'Loading…' : isPro ? 'Manage subscription' : 'Upgrade to Pro'}
      </button>
      {error && <p className="text-xs" style={{ color: 'var(--danger)' }}>{error}</p>}
    </div>
  );
}
