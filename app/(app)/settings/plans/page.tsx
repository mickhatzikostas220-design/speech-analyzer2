// Plans & billing — presents the three subscription tiers and the user's
// current plan. Online checkout (Stripe) isn't wired yet, so upgrades route to
// support via email; once Stripe is connected, swap the CTA for a checkout link.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Check, ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getUserPlan } from '@/lib/subscription/server';
import { PLANS, PLAN_BY_ID, planRank } from '@/lib/subscription/plans';

export const dynamic = 'force-dynamic';

const SUPPORT_EMAIL = process.env.ADMIN_EMAIL ?? 'mickhatzikostas220@gmail.com';

export default async function PlansPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const currentPlan = await getUserPlan(supabase);
  const currentRank = planRank(currentPlan);

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

      <div className="grid gap-5 md:grid-cols-3">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentPlan;
          const isUpgrade = planRank(plan.id) > currentRank;
          return (
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
                {isCurrent ? (
                  <button
                    disabled
                    className="w-full rounded-[var(--radius-pill)] border-2 border-[var(--border-subtle)] py-2 text-sm font-bold text-muted"
                  >
                    Current plan
                  </button>
                ) : isUpgrade ? (
                  <a
                    href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
                      `Upgrade to ${plan.name}`
                    )}&body=${encodeURIComponent(
                      `Hi, I'd like to upgrade my account (${user.email}) to the ${plan.name} plan.`
                    )}`}
                    className={plan.highlighted ? 'btn-primary w-full' : 'btn-outline w-full'}
                  >
                    Upgrade
                  </a>
                ) : (
                  <button
                    disabled
                    className="w-full rounded-[var(--radius-pill)] border-2 border-[var(--border-subtle)] py-2 text-sm font-bold text-faint"
                  >
                    Included
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-8 text-center text-xs text-faint">
        Online checkout is coming soon. To change your plan now, use the Upgrade button to reach us
        and we&apos;ll get you set up.
      </p>
    </div>
  );
}
