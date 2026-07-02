// Speech Analyzer page. Renders the upload + recent-analyses hub and, for
// free-plan speakers, a banner showing how many of their monthly analyses
// remain — so the limit enforced server-side in app/api/analyses is visible
// before they hit it. Usage is counted server-side via the shared helper so it
// always matches what the gate enforces.
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { DashboardHome } from '@/components/DashboardHome';
import { createClient } from '@/lib/supabase/server';
import { getUserPlan } from '@/lib/subscription/server';
import { monthlyAnalysisCount } from '@/lib/subscription/usage';
import { FREE_MONTHLY_ANALYSES } from '@/lib/subscription/plans';
import { FreeQuotaBanner } from '@/components/subscription/FreeQuotaBanner';

export const dynamic = 'force-dynamic';

export default async function AnalyzePage() {
  const supabase = createClient();
  const plan = await getUserPlan(supabase);

  // Only free users have a quota to show; count is null-safe (fails open).
  let used: number | null = null;
  if (plan === 'free') {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) used = await monthlyAnalysisCount(supabase, user.id);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-12">
      <Link
        href="/dashboard"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-muted transition-colors hover:text-strong"
      >
        <ArrowLeft className="h-4 w-4" /> Back to hub
      </Link>
      <p className="eyebrow mb-2">Speech Analyzer</p>
      {plan === 'free' && used !== null && (
        <FreeQuotaBanner used={used} limit={FREE_MONTHLY_ANALYSES} />
      )}
      <DashboardHome />
    </div>
  );
}
