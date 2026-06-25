import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, Lock, Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getUserBilling } from '@/lib/billing/server';
import { getUserBrandState } from '@/lib/brand/server';
import { AeoTool } from '@/components/aeo/AeoTool';
import { PLANS } from '@/lib/billing/plans';

export const dynamic = 'force-dynamic';

export default async function AeoPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [billing, brandState] = await Promise.all([
    getUserBilling(supabase, user.id),
    getUserBrandState(),
  ]);

  const Header = (
    <>
      <Link
        href="/dashboard"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-muted transition-colors hover:text-strong"
      >
        <ArrowLeft className="h-4 w-4" /> Back to hub
      </Link>
      <p className="eyebrow mb-2">AEO / SEO tool</p>
      <h1 className="display-h1 mb-1">Get found by search &amp; AI</h1>
      <p className="mb-8 max-w-xl text-muted">
        Generate the meta tags, keywords, answer-engine FAQ, and JSON-LD structured data that make
        your talks rank on Google and get cited by AI answer engines.
      </p>
    </>
  );

  // Gate: Full Premium only.
  if (!billing.planConfig.aeoSeo) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:py-12">
        {Header}
        <div className="card p-8 text-center">
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--ink-100)]">
            <Lock className="h-6 w-6 text-strong" />
          </span>
          <h2 className="text-xl font-extrabold text-strong">A Full Premium tool</h2>
          <p className="mx-auto mt-2 max-w-md text-muted">
            {billing.plan === 'core'
              ? `You're on ${PLANS.core.name}, which unlocks everything except the AEO/SEO tool. Upgrade to ${PLANS.full.name} to use it.`
              : `The AEO/SEO tool is part of ${PLANS.full.name} ($${PLANS.full.priceMonthly}/month).`}
          </p>
          <Link href="/pricing" className="btn-primary mt-6 inline-flex">
            <Sparkles className="h-4 w-4" /> Upgrade to Full Premium
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-12">
      {Header}
      <AeoTool speakerName={brandState.brand.name || 'the speaker'} />
    </div>
  );
}
