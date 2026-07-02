import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { FREE_MONTHLY_ANALYSES } from '@/lib/subscription/plans';
import { monthlyAnalysisCount } from '@/lib/subscription/usage';
import { PAYWALLS_ENABLED } from '@/lib/subscription/config';
import { rateLimit } from '@/lib/rateLimit';

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('analyses')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Abuse guard: no human uploads 10 talks a minute. Burst protection that
  // shields the expensive downstream processing (Whisper + GPT-4o). The free
  // monthly quota below is the real cap; this just stops rapid-fire.
  const rl = rateLimit(`analyses:create:${user.id}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'You are creating analyses too quickly — please wait a moment and try again.', code: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
    );
  }

  const body = await request.json();
  const { title, file_path, file_type, duration_seconds } = body;

  if (!title || !file_path || !file_type) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Enforce the Free plan's monthly analysis quota that the marketing/pricing
  // pages advertise. Fail-open by design: if the plan lookup or the count query
  // errors for any reason, we let the analysis through rather than block a user
  // (especially a paying one) on an infrastructure hiccup. Only a confirmed
  // free-plan user who is confirmed at/over the limit is stopped.
  //
  // This is the one paywall that reads profiles.plan directly instead of going
  // through getUserPlan, so the master switch (lib/subscription/config.ts) is
  // checked explicitly here: when paywalls are off, the quota is skipped
  // entirely and analyses are unlimited for everyone.
  if (PAYWALLS_ENABLED) try {
    const { data: profile, error: planErr } = await supabase
      .from('profiles')
      .select('plan')
      .eq('id', user.id)
      .single();
    const plan = planErr ? null : (profile as { plan?: string } | null)?.plan ?? null;

    if (plan === 'free') {
      // null = count couldn't be determined; fall open rather than block.
      const used = await monthlyAnalysisCount(supabase, user.id);
      if (used !== null && used >= FREE_MONTHLY_ANALYSES) {
        return NextResponse.json(
          {
            error: `You've reached your ${FREE_MONTHLY_ANALYSES} free analyses for this month. Upgrade to Core Premium for unlimited analyses.`,
            code: 'free_limit_reached',
          },
          { status: 402 }
        );
      }
    }
  } catch {
    /* fail open — never block an upload on a quota-check error */
  }

  const { data, error } = await supabase
    .from('analyses')
    .insert({ user_id: user.id, title, file_path, file_type, duration_seconds, status: 'pending' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
