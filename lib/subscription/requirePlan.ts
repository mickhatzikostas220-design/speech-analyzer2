// Server-side plan guard for API routes — the enforcement half that the route
// layouts (UI) can't provide, so a savvy user can't bypass the paywall by
// calling the API directly. Returns a 402 response to return early if the
// signed-in user's plan is below `required`, otherwise null (proceed).
//
// Note: getUserPlan defaults to 'free' on any lookup error, so an infra hiccup
// denies premium access rather than granting it — the correct fail direction
// for a paywall.
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getUserPlan } from './server';
import { planRank, PLAN_BY_ID, type PlanId } from './plans';

export async function requirePlan(
  supabase: SupabaseClient,
  required: PlanId
): Promise<NextResponse | null> {
  const plan = await getUserPlan(supabase);
  if (planRank(plan) < planRank(required)) {
    return NextResponse.json(
      { error: `This is a ${PLAN_BY_ID[required].name} feature. Upgrade to unlock it.`, code: 'plan_required' },
      { status: 402 }
    );
  }
  return null;
}
