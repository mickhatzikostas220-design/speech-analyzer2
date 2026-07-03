'use server';

// Server Action: pin or unpin a hub tool for the signed-in speaker.
//
// Every export in a 'use server' file becomes a callable server action, so this
// file holds only the favorite mutation. The write runs as the user (the server
// Supabase client carries their session), so the existing "Users update own
// profile" RLS policy on profiles is what authorizes it — no service role.

import { createClient } from '@/lib/supabase/server';
import { TOOL_KEYS } from '@/lib/tools/catalog';

/**
 * Add or remove `key` from the user's favorite_tools array and return the
 * updated list (authoritative, so the client can reconcile its optimistic UI).
 * No-ops safely on an unknown key or signed-out user.
 */
export async function setToolFavorite(key: string, favorited: boolean): Promise<string[]> {
  if (!TOOL_KEYS.includes(key)) return [];

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from('profiles')
    .select('favorite_tools')
    .eq('id', user.id)
    .maybeSingle();

  const current: string[] = Array.isArray((data as { favorite_tools?: unknown } | null)?.favorite_tools)
    ? ((data as { favorite_tools: unknown[] }).favorite_tools.filter((k): k is string => typeof k === 'string'))
    : [];

  // Compute the next list. Favoriting appends (preserving pin order); the guard
  // against duplicates keeps the array clean if the UI double-fires.
  const next = favorited
    ? current.includes(key)
      ? current
      : [...current, key]
    : current.filter((k) => k !== key);

  const { error } = await supabase
    .from('profiles')
    .update({ favorite_tools: next })
    .eq('id', user.id);

  // On a write failure, report the unchanged list so the client reverts.
  return error ? current : next;
}
