// Reads the signed-in user's current subscription plan from profiles.plan.
// Resilient by design: if the column or row is missing (e.g. the migration in
// supabase/subscription.sql hasn't been run yet), it falls back to 'free' so
// the Plans page never errors.
import type { SupabaseClient } from '@supabase/supabase-js';
import { type PlanId } from './plans';

const VALID: PlanId[] = ['free', 'core', 'full'];

export async function getUserPlan(supabase: SupabaseClient): Promise<PlanId> {
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
