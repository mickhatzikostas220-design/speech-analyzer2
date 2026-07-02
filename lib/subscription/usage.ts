// Shared "how many analyses this month" logic. Both the server-side quota gate
// (app/api/analyses) and the on-screen usage banner (the Analyzer page) count
// through this one helper, so the number a free speaker is *shown* can never
// drift from the number that is actually *enforced* — that consistency is a
// correctness requirement, not just tidiness.

import type { SupabaseClient } from '@supabase/supabase-js';

/** Start of the current calendar month, in UTC (matches how we bill months). */
export function currentMonthStart(): Date {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Count the analyses a user has created since the start of this month.
 * Returns `null` when the count can't be determined (query error) so callers
 * can fail open — we never block or mislead a user because of an infra hiccup.
 */
export async function monthlyAnalysisCount(
  supabase: SupabaseClient,
  userId: string
): Promise<number | null> {
  const { count, error } = await supabase
    .from('analyses')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', currentMonthStart().toISOString());

  if (error || typeof count !== 'number') return null;
  return count;
}
