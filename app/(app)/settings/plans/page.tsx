// Plans & billing — presents the three subscription tiers and the user's
// current plan. Upgrades start Stripe Checkout (PlanActions → /api/subscription/checkout,
// applied via webhook). Until the Stripe keys are set, that route returns a clear
// "billing not configured" message, so the CTA degrades gracefully.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Check, ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getBillingPlan } from '@/lib/subscription/server';
import { PLANS, PLAN_BY_ID } from '@/lib/subscription/plans';
import { PlanActions } from '@/components/subscription/PlanActions';

export const dynamic = 'force-dynamic';

export default async function PlansPage({
  searchParams,
}: {
  searchParams: { upgraded?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Billing display: always show the user's real plan, even while paywalls are
  // switched off — so this page stays accurate for managing/testing billing.
  const currentPlan = await getBillingPlan(supabase);
  const justUpgraded = searchParams.upgraded === '1';

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <Link
        href="/settings"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-muted transition-colors hover:text-strong"
      >
        <ArrowLeft className="h-4 w-4" /> Settings
      </Link>

      <p className="eyebrow mb-2">Plans &amp; billing</p>
      <h1 className="display-h1 mb-1">Choose your plan</h1>
      <p className="mb-8 text-muted">
        You&apos;re currently on the{' '}
        <span className="font-bold text-strong">{PLAN_BY_ID[currentPlan].name}</span> plan.
      </p>

      {justUpgraded && (
        <div className="mb-6 rounded-[var(--radius-md)] border border-[color:var(--success)]/40 bg-[var(--success-bg)] px-4 py-3 text-sm text-[color:var(--success)]">
          Thanks! Your subscription is being activated — it’ll update here within a moment.
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-3">
        {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-[var(--radius-lg)] border bg-surface-card p-6 ${
                plan.highlighted
                  ? 'border-[color:var(--signature)] shadow-soft'
                  : 'border-[var(--border-subtle)]'
              }`}
            >
              {plan.highlighted && (
                <span className="absolute -top-3 left-6 rounded-[var(--radius-pill)] bg-[var(--signature)] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[color:var(--on-signature)]">
                  Most popular
                </span>
              )}

              <h2 className="text-lg font-extrabold text-strong">{plan.name}</h2>
              <p className="mt-1 min-h-[40px] text-sm text-muted">{plan.tagline}</p>

              <div className="mt-4 flex items-end gap-1">
                <span className="text-3xl font-extrabold text-strong">${plan.price}</span>
                <span className="mb-1 text-sm text-muted">/ month</span>
              </div>

              <ul className="mt-5 flex-1 space-y-2.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-body">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--success)]" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                <PlanActions planId={plan.id} currentPlan={currentPlan} highlighted={plan.highlighted} />
              </div>
            </div>
          ))}
      </div>

      <p className="mt-8 text-center text-xs text-faint">
        Secure checkout and billing are handled by Stripe. Cancel anytime from “Manage billing”.
      </p>
    </div>
  );
}
