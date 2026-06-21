import type { SupabaseClient } from '@supabase/supabase-js';
import type { Autonomy, SideEffect, ToolDef } from '../types';
import { listConnections } from '../store';
import { analysesTools } from './analyses';
import { gmailTools } from './gmail';
import { socialTools } from './social';
import { PLATFORM_LABELS, type Platform } from '@/lib/clipflow/types';

// Which side effects each autonomy level permits. "whatever the user allows" —
// the user picks the level per connection.
const ALLOWED_EFFECTS: Record<Autonomy, SideEffect[]> = {
  read_only: ['none'],
  draft_confirm: ['none', 'reversible'],
  act_directly: ['none', 'reversible', 'irreversible'],
};

// Assemble the tool set for a request: always the read-only speech-aware tools,
// plus tools for each connected app gated by that connection's autonomy.
export async function buildTools(
  supabase: SupabaseClient,
  userId: string
): Promise<{ tools: ToolDef[]; notes: string[] }> {
  // Read-only social analytics is always on — it reuses ClipFlow's connections
  // and never writes, so it isn't gated by per-app autonomy.
  const tools: ToolDef[] = [...analysesTools, ...socialTools];
  const notes: string[] = [];

  const connections = await listConnections(supabase, userId);
  for (const conn of connections) {
    if (conn.provider === 'google') {
      const allowed = ALLOWED_EFFECTS[conn.autonomy];
      const usable = gmailTools(conn.id).filter((t) => allowed.includes(t.sideEffect));
      tools.push(...usable);
      notes.push(
        `Gmail account ${conn.account_email ?? '(connected)'} — permission level: ${conn.autonomy.replace('_', ' ')}.`
      );
    }
  }

  // Surface connected social accounts (from ClipFlow) so the agent knows it can
  // pull their analytics with the social tools.
  const { data: social } = await supabase
    .from('clipflow_connections')
    .select('platform, account_name')
    .eq('user_id', userId);
  for (const s of (social ?? []) as { platform: Platform; account_name: string | null }[]) {
    notes.push(
      `${PLATFORM_LABELS[s.platform]}${s.account_name ? ` (${s.account_name})` : ''} — read-only analytics available.`
    );
  }

  return { tools, notes };
}
