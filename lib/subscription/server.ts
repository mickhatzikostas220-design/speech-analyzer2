// Reads the signed-in user's subscription plan.
//
// Two functions, on purpose:
//   • getBillingPlan  — the plan the user is ACTUALLY on (what they pay for).
//                       Use this for billing/display surfaces like the Plans page.
//   • getUserPlan     — the plan we treat the user as having for ACCESS gating.
//                       Every paywall calls this. When the master switch
//                       PAYWALLS_ENABLED is off, it returns 'full' for everyone,
//                       which opens every gate in one place.
//
// Resilient by design: if the column or row is missing (e.g. the migration in
// supabase/subscription.sql hasn't been run yet), it falls back to 'free' so
// the Plans page never errors.
import type { SupabaseClient } from '@supabase/supabase-js';
import { type PlanId } from './plans';
import { PAYWALLS_ENABLED } from './config';

const VALID: PlanId[] = ['free', 'core', 'full'];

/** The user's real, billed plan — always truthful, ignores the paywall switch. */
export async function getBillingPlan(supabase: SupabaseClient): Promise<PlanId> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 'free';

  try {
    const { data } = await supabase.from('profiles').select('plan').eq('id', user.id).single();
    const plan = (data as { plan?: string } | null)?.plan;
    return plan && VALID.includes(plan as PlanId) ? (plan as PlanId) : 'free';
  } catch {
    return 'free';
  }
}

/**
 * The plan to enforce access against. Use this for every paywall/gate.
 * When paywalls are switched off (PAYWALLS_ENABLED === false), everyone is
 * treated as top-tier 'full' so all gates open — flip the switch back to
 * restore real enforcement. See lib/subscription/config.ts.
 */
export async function getUserPlan(supabase: SupabaseClient): Promise<PlanId> {
  if (!PAYWALLS_ENABLED) return 'full';
  return getBillingPlan(supabase);
}
