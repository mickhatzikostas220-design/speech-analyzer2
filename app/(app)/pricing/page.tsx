import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getUserBilling } from '@/lib/billing/server';
import { PricingPlans } from '@/components/billing/PricingPlans';

export const dynamic = 'force-dynamic';

export default async function PricingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const billing = await getUserBilling(supabase, user.id);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:py-12">
      <Link
        href="/dashboard"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-muted transition-colors hover:text-strong"
      >
        <ArrowLeft className="h-4 w-4" /> Back to hub
      </Link>
      <p className="eyebrow mb-2">Plans &amp; billing</p>
      <h1 className="display-h1 mb-1">Pick the plan that fits</h1>
      <p className="mb-8 max-w-xl text-muted">
        Upgrade any time. Premium unlocks unlimited analyses, bigger uploads, deeper AI insights,
        and — on Full Premium — the AEO/SEO discovery tool.
      </p>

      <Suspense fallback={null}>
        <PricingPlans
          currentPlan={billing.plan}
          paymentFailed={billing.paymentFailed}
          hasSubscription={Boolean(billing.stripeSubscriptionId)}
        />
      </Suspense>
    </div>
  );
}
