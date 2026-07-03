// Server-side read of the signed-in speaker's pinned tools.
//
// Defensive by design: if the favorite_tools column isn't migrated yet (see
// supabase/favorites.sql) or anything errors, we return an empty list so the
// top bar simply shows no pins rather than breaking the whole app.

import { createClient } from '@/lib/supabase/server';
import { TOOL_KEYS } from '@/lib/tools/catalog';

/** The current user's favorited tool keys, filtered to ones we still ship. */
export async function getFavoriteTools(): Promise<string[]> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('profiles')
      .select('favorite_tools')
      .eq('id', user.id)
      .maybeSingle();

    if (error || !data) return [];

    const raw = (data as { favorite_tools?: unknown }).favorite_tools;
    if (!Array.isArray(raw)) return [];

    // Drop any keys that no longer map to a real tool (e.g. a removed feature).
    return raw.filter((k): k is string => typeof k === 'string' && TOOL_KEYS.includes(k));
  } catch {
    return [];
  }
}
