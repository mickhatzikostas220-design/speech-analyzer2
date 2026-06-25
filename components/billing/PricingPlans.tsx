'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check } from 'lucide-react';
import { PLANS, PLAN_ORDER, type PlanId } from '@/lib/billing/plans';

interface Props {
  currentPlan: PlanId;
  paymentFailed: boolean;
  hasSubscription: boolean;
}

export function PricingPlans({ currentPlan, paymentFailed, hasSubscription }: Props) {
  const params = useSearchParams();
  const status = params.get('status');
  const [busy, setBusy] = useState<PlanId | 'manage' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function subscribe(plan: Exclude<PlanId, 'free'>) {
    setBusy(plan);
    setError(null);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? 'Could not start checkout.');
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setBusy(null);
    }
  }

  async function manage() {
    setBusy('manage');
    setError(null);
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? 'Could not open billing portal.');
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setBusy(null);
    }
  }

  return (
    <div>
      {status === 'success' && (
        <div className="mb-6 rounded-[var(--radius-md)] border border-[var(--success)] bg-[color:var(--success)]/10 px-4 py-3 text-sm font-semibold text-strong">
          🎉 Payment received — your plan is being activated. It updates within a few seconds.
        </div>
      )}
      {status === 'canceled' && (
        <div className="mb-6 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-surface-card px-4 py-3 text-sm text-muted">
          Checkout canceled — no charge was made.
        </div>
      )}
      {paymentFailed && (
        <div className="mb-6 rounded-[var(--radius-md)] border border-[var(--danger)] bg-[color:var(--danger)]/10 px-4 py-3 text-sm font-semibold text-strong">
          ⚠️ Your last payment failed. Update your payment method to keep premium features.
        </div>
      )}
      {error && (
        <div className="mb-6 rounded-[var(--radius-md)] border border-[var(--danger)] px-4 py-3 text-sm" style={{ color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        {PLAN_ORDER.map((id) => {
          const plan = PLANS[id];
          const isCurrent = id === currentPlan;
          const highlight = id === 'core';
          return (
            <div
              key={id}
              className={[
                'flex flex-col rounded-[var(--radius-lg)] border bg-surface-card p-6 transition',
                highlight ? 'border-[var(--signature)] shadow-soft' : 'border-[var(--border-subtle)]',
              ].join(' ')}
            >
              <div className="mb-1 flex items-center justify-between">
                <h3 className="text-lg font-extrabold text-strong">{plan.name}</h3>
                {isCurrent && (
                  <span className="rounded-full bg-[var(--ink-100)] px-2.5 py-0.5 text-xs font-bold text-strong">
                    Current
                  </span>
                )}
              </div>
              <p className="text-sm text-muted">{plan.tagline}</p>

              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-3xl font-extrabold text-strong">${plan.priceMonthly}</span>
                <span className="text-sm text-muted">/month</span>
              </div>

              <ul className="mt-5 space-y-2.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-body">
                    <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--signature)' }} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-6 pt-2">
                {id === 'free' ? (
                  <button
                    disabled
                    className="btn-outline w-full opacity-60"
                    style={{ padding: '10px 0' }}
                  >
                    {isCurrent ? 'Current plan' : 'Included'}
                  </button>
                ) : isCurrent ? (
                  <button
                    onClick={manage}
                    disabled={busy !== null}
                    className="btn-outline w-full"
                    style={{ padding: '10px 0' }}
                  >
                    {busy === 'manage' ? 'Opening…' : 'Manage plan'}
                  </button>
                ) : (
                  <button
                    onClick={() => subscribe(id as Exclude<PlanId, 'free'>)}
                    disabled={busy !== null}
                    className={highlight ? 'btn-primary w-full' : 'btn-outline w-full'}
                    style={{ padding: '10px 0' }}
                  >
                    {busy === id
                      ? 'Redirecting…'
                      : currentPlan !== 'free'
                        ? `Switch to ${plan.name}`
                        : `Subscribe`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {hasSubscription && currentPlan !== 'free' && (
        <p className="mt-6 text-center text-xs text-muted">
          Need to cancel or update your card?{' '}
          <button onClick={manage} className="font-semibold underline" disabled={busy !== null}>
            Open the billing portal
          </button>
          .
        </p>
      )}
    </div>
  );
}
