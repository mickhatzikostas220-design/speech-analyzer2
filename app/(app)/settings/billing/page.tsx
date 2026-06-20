import { createClient } from '@/lib/supabase/server';
import { FREE_DAILY_LIMIT, TOOLS } from '@/lib/limits';
import { BillingActions } from './BillingActions';

export const dynamic = 'force-dynamic';

export default async function BillingPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: sub } = user
    ? await supabase.from('subscriptions').select('status').eq('user_id', user.id).maybeSingle()
    : { data: null };

  const isPro = sub?.status === 'active' || sub?.status === 'trialing';

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold text-strong">Plan &amp; billing</h1>

      <div className="mt-6 rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-surface-card p-6">
        <p className="text-sm text-muted">Current plan</p>
        <p className="mt-1 text-xl font-semibold text-strong">{isPro ? 'Pro' : 'Free'}</p>
        <p className="mt-3 text-sm text-muted">
          {isPro
            ? 'Unlimited use of every tool.'
            : `Free includes ${FREE_DAILY_LIMIT} uses per day of each tool (${Object.values(TOOLS).join(', ')}). Upgrade to Pro for unlimited use.`}
        </p>
        <div className="mt-5">
          <BillingActions isPro={isPro} />
        </div>
      </div>
    </div>
  );
}
