import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PLATFORMS, PLATFORM_LABELS } from '@/lib/clipflow/types';
import { isConfigured } from '@/lib/clipflow/platforms';

export const dynamic = 'force-dynamic';

// Returns connection status for all platforms. Deliberately selects only
// non-sensitive columns — encrypted tokens never leave the server.
export async function GET() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: rows } = await supabase
      .from('clipflow_connections')
      .select('platform, account_name, token_expires_at')
      .eq('user_id', user.id);

    const byPlatform = new Map((rows ?? []).map((r) => [r.platform, r]));

    const connections = PLATFORMS.map((platform) => {
      const row = byPlatform.get(platform);
      return {
        platform,
        label: PLATFORM_LABELS[platform],
        configured: isConfigured(platform),
        connected: Boolean(row),
        account_name: row?.account_name ?? null,
        token_expires_at: row?.token_expires_at ?? null,
      };
    });

    return NextResponse.json(connections);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
