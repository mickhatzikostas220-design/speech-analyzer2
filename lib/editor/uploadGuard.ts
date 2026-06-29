import type { SupabaseClient } from '@supabase/supabase-js';

// Shared guards for the editor/script upload routes. These routes write to
// storage with the service-role (admin) client, so they must (1) confirm the
// caller actually owns the project before minting an upload URL, and (2) keep
// the file extension on a known allow-list rather than splicing an arbitrary
// user-supplied string into the storage object key.

const ALLOWED_EXT = new Set([
  'mp4', 'mov', 'webm', 'm4v', 'mkv', // video
  'm4a', 'mp3', 'wav', 'aac', 'ogg',  // audio
]);

/** Sanitize a filename's extension to a known-safe token (defaults to mp4). */
export function safeExt(fileName: string): string {
  const raw = (String(fileName).split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return ALLOWED_EXT.has(raw) ? raw : 'mp4';
}

/** True only if `id` is a project in `table` owned by `userId`. */
export async function ownsProject(
  supabase: SupabaseClient,
  table: 'editor_projects' | 'script_projects',
  id: string,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from(table)
    .select('id')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  return !!data;
}
