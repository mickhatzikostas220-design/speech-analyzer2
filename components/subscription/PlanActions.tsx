'use client';

// Action button for a plan card: starts Stripe Checkout for an upgrade, opens
// the billing portal for the current paid plan, or shows a disabled state.
import { useState } from 'react';
import { type PlanId, planRank } from '@/lib/subscription/plans';

export function PlanActions({
  planId,
  currentPlan,
  highlighted,
  locked,
}: {
  planId: PlanId;
  currentPlan: PlanId;
  highlighted?: boolean;
  /** Free beta: paid upgrades are turned off, so show an "included" state. */
  locked?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCurrent = planId === currentPlan;
  const isUpgrade = planRank(planId) > planRank(currentPlan);

  async function post(url: string, body?: object) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setError(data.error || 'Something went wrong. Please try again.');
        setLoading(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  }

  // Current paid plan → manage/cancel via the billing portal.
  if (isCurrent && planId !== 'free') {
    return (
      <div>
        <button onClick={() => post('/api/subscription/portal')} disabled={loading} className="btn-outline w-full">
          {loading ? 'Opening…' : 'Manage billing'}
        </button>
        {error && <p className="mt-2 text-center text-xs text-[color:var(--danger)]">{error}</p>}
      </div>
    );
  }

  if (isCurrent) {
    return (
      <button disabled className="w-full rounded-[var(--radius-pill)] border-2 border-[var(--border-subtle)] py-2 text-sm font-bold text-muted">
        Current plan
      </button>
    );
  }

  // Free beta: everything is unlocked at no charge, so paid upgrades are hidden
  // behind a plain "included" state instead of a checkout button.
  if (locked && isUpgrade) {
    return (
      <button disabled className="w-full rounded-[var(--radius-pill)] border-2 border-[var(--border-subtle)] py-2 text-sm font-bold text-faint">
        Free during beta
      </button>
    );
  }

  if (isUpgrade) {
    return (
      <div>
        <button
          onClick={() => post('/api/subscription/checkout', { plan: planId })}
          disabled={loading}
          className={highlighted ? 'btn-primary w-full' : 'btn-outline w-full'}
        >
          {loading ? 'Redirecting…' : 'Upgrade'}
        </button>
        {error && <p className="mt-2 text-center text-xs text-[color:var(--danger)]">{error}</p>}
      </div>
    );
  }

  return (
    <button disabled className="w-full rounded-[var(--radius-pill)] border-2 border-[var(--border-subtle)] py-2 text-sm font-bold text-faint">
      Included
    </button>
  );
}
