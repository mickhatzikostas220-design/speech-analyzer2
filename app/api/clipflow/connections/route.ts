import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PLATFORMS, PLATFORM_LABELS, type Platform } from '@/lib/clipflow/types';
import { isConfiguredWith } from '@/lib/clipflow/platforms';
import { uploadPostEnabledFor, getUserConnection } from '@/lib/clipflow/uploadpost';
import { resolveUploadPostKey, resolveOAuthCreds } from '@/lib/clipflow/secrets';

export const dynamic = 'force-dynamic';

// Returns connection status for all platforms. Deliberately selects only
// non-sensitive columns — credentials never leave the server.
//
// Two providers: when Upload-Post is configured it owns the connections and the
// account list comes from the user's Upload-Post profile; otherwise each platform
// is connected through its own OAuth flow and stored in clipflow_connections.
export async function GET() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const uploadPostKey = await resolveUploadPostKey(supabase, user.id);
    if (uploadPostEnabledFor(uploadPostKey)) {
      let connected: Platform[] = [];
      let names: Partial<Record<Platform, string>> = {};
      try {
        ({ connected, names } = await getUserConnection(user.id, uploadPostKey!));
      } catch {
        // Surface every platform as not-yet-connected if Upload-Post is unreachable.
      }

      const connections = PLATFORMS.map((platform) => ({
        platform,
        label: PLATFORM_LABELS[platform],
        configured: true,
        connected: connected.includes(platform),
        account_name: names[platform] ?? null,
        token_expires_at: null,
        provider: 'uploadpost' as const,
      }));

      return NextResponse.json(connections);
    }

    const { data: rows } = await supabase
      .from('clipflow_connections')
      .select('platform, account_name, token_expires_at')
      .eq('user_id', user.id);

    const byPlatform = new Map((rows ?? []).map((r) => [r.platform, r]));

    // Per-platform OAuth: a platform is "configured" if the user supplied their
    // own client creds or the app env has them.
    const creds = await Promise.all(
      PLATFORMS.map((p) => resolveOAuthCreds(supabase, user.id, p))
    );

    const connections = PLATFORMS.map((platform, i) => {
      const row = byPlatform.get(platform);
      return {
        platform,
        label: PLATFORM_LABELS[platform],
        configured: isConfiguredWith(platform, creds[i]),
        connected: Boolean(row),
        account_name: row?.account_name ?? null,
        token_expires_at: row?.token_expires_at ?? null,
        provider: 'oauth' as const,
      };
    });

    return NextResponse.json(connections);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
