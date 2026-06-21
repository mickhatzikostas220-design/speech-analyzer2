import type { SupabaseClient } from '@supabase/supabase-js';
import type { ToolDef } from '../types';
import { decryptToken } from '@/lib/clipflow/crypto';
import { fetchSocialAnalytics, formatSocialAnalytics } from '@/lib/clipflow/analytics';
import { PLATFORMS, PLATFORM_LABELS, type Platform } from '@/lib/clipflow/types';

// Social-analytics tools: let the agent read performance (followers, views,
// engagement) from the social accounts the user connected in ClipFlow. These
// reuse the existing encrypted OAuth tokens — they are read-only, so they are
// always available regardless of any per-app autonomy level.

interface ConnectionRow {
  platform: Platform;
  account_name: string | null;
  account_id: string | null;
  encrypted_access_token: string | null;
  token_expires_at: string | null;
}

async function loadConnections(supabase: SupabaseClient, userId: string): Promise<ConnectionRow[]> {
  const { data } = await supabase
    .from('clipflow_connections')
    .select('platform, account_name, account_id, encrypted_access_token, token_expires_at')
    .eq('user_id', userId);
  return ((data as ConnectionRow[] | null) ?? []).filter((c) => Boolean(c.encrypted_access_token));
}

export const socialTools: ToolDef[] = [
  {
    name: 'list_social_accounts',
    description:
      "List the social media accounts the user has connected in ClipFlow (Instagram, TikTok, YouTube, X). Use this to see which platforms' analytics are available before calling get_social_analytics.",
    sideEffect: 'none',
    parameters: { type: 'object', properties: {} },
    async execute(_args, ctx) {
      const conns = await loadConnections(ctx.supabase, ctx.userId);
      if (conns.length === 0) {
        return 'No social accounts are connected. The user can connect Instagram, TikTok, YouTube, or X from the ClipFlow page.';
      }
      return conns
        .map((c) => {
          const expired = c.token_expires_at && new Date(c.token_expires_at).getTime() < Date.now();
          return `- ${PLATFORM_LABELS[c.platform]} (${c.platform})${c.account_name ? ` — ${c.account_name}` : ''}${
            expired ? ' [token expired — user may need to reconnect]' : ''
          }`;
        })
        .join('\n');
    },
  },
  {
    name: 'get_social_analytics',
    description:
      'Get analytics (followers, views, likes, engagement) for the user\'s connected social media accounts. Pass a specific platform, or omit to pull every connected platform. Use this when the user asks how their social media, channel, posts, reels, or videos are performing.',
    sideEffect: 'none',
    parameters: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: PLATFORMS,
          description: 'Which platform to pull. Omit to fetch all connected platforms.',
        },
      },
    },
    async execute(args, ctx) {
      const requested = typeof args.platform === 'string' ? (args.platform as Platform) : null;
      if (requested && !PLATFORMS.includes(requested)) {
        return `Unknown platform "${requested}". Valid platforms: ${PLATFORMS.join(', ')}.`;
      }

      const conns = await loadConnections(ctx.supabase, ctx.userId);
      const targets = requested ? conns.filter((c) => c.platform === requested) : conns;

      if (targets.length === 0) {
        return requested
          ? `${PLATFORM_LABELS[requested]} is not connected. The user can connect it from the ClipFlow page.`
          : 'No social accounts are connected. The user can connect them from the ClipFlow page.';
      }

      const results = await Promise.all(
        targets.map(async (c) => {
          try {
            const analytics = await fetchSocialAnalytics(
              c.platform,
              decryptToken(c.encrypted_access_token!),
              c.account_id
            );
            return formatSocialAnalytics(analytics);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return `${PLATFORM_LABELS[c.platform]}: could not fetch analytics (${msg}).`;
          }
        })
      );
      return results.join('\n\n');
    },
  },
];
