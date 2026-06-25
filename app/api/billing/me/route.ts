import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserBilling } from '@/lib/billing/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Lightweight billing snapshot for the signed-in user (used by client UI). */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const billing = await getUserBilling(supabase, user.id);

  return NextResponse.json({
    plan: billing.plan,
    planName: billing.planConfig.name,
    maxUploadBytes: billing.planConfig.maxUploadBytes,
    monthlyAnalysisLimit: billing.planConfig.monthlyAnalysisLimit,
    analysisCount: billing.analysisCount,
    remaining: billing.remaining,
    aeoSeo: billing.planConfig.aeoSeo,
    prioritySupport: billing.prioritySupport,
    paymentFailed: billing.paymentFailed,
  });
}
