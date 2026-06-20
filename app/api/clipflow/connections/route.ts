import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PLATFORMS, PLATFORM_LABELS, type Platform } from '@/lib/clipflow/types';
import { isConfigured } from '@/lib/clipflow/platforms';
import {
  postizEnabled,
  postizAppUrl,
  listIntegrations,
  platformForProvider,
} from '@/lib/clipflow/postiz';

export const dynamic = 'force-dynamic';

// Returns connection status for all platforms. Deliberately selects only
// non-sensitive columns — encrypted tokens never leave the server.
//
// Two providers: when Postiz is configured it owns the connections (the account
// list comes from the Postiz workspace); otherwise each platform is connected
// through its own OAuth flow and stored in clipflow_connections.
export async function GET() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (postizEnabled()) {
      const manageUrl = postizAppUrl();
      const connected = new Map<Platform, string | null>();
      try {
        const integrations = await listIntegrations();
        for (const integration of integrations) {
          if (integration.disabled) continue;
          const platform = platformForProvider(integration.identifier);
          if (platform && !connected.has(platform)) {
            connected.set(platform, integration.name || null);
          }
        }
      } catch {
        // Surface every platform as not-yet-connected if Postiz is unreachable.
      }

      const connections = PLATFORMS.map((platform) => ({
        platform,
        label: PLATFORM_LABELS[platform],
        configured: true,
        connected: connected.has(platform),
        account_name: connected.get(platform) ?? null,
        token_expires_at: null,
        provider: 'postiz' as const,
        manage_url: manageUrl,
      }));

      return NextResponse.json(connections);
    }

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
        provider: 'oauth' as const,
      };
    });

    return NextResponse.json(connections);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
