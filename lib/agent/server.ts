import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Resolve the signed-in user (via cookie session) and a service-role client for
// agent tables. Returns null when unauthenticated.
export async function getUserAndAdmin(): Promise<{ user: User; admin: SupabaseClient } | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { user, admin: createAdminClient() };
}
