import type { SupabaseClient } from '@supabase/supabase-js';
import type { Autonomy, SideEffect, ToolDef } from '../types';
import { listConnections } from '../store';
import { analysesTools } from './analyses';
import { gmailTools } from './gmail';
import { calendarTools } from './calendar';
import { socialTools } from './social';
import { memoryTools } from './memory';

// Which side effects each autonomy level permits. "whatever the user allows" —
// the user picks the level per connection.
const ALLOWED_EFFECTS: Record<Autonomy, SideEffect[]> = {
  read_only: ['none'],
  draft_confirm: ['none', 'reversible'],
  act_directly: ['none', 'reversible', 'irreversible'],
};

// Assemble the tool set for a request: always the read-only speech-aware and
// social-analytics tools, plus tools for each connected app gated by that
// connection's autonomy.
export async function buildTools(
  supabase: SupabaseClient,
  userId: string
): Promise<{ tools: ToolDef[]; notes: string[] }> {
  const tools: ToolDef[] = [...analysesTools, ...socialTools, ...memoryTools];
  const notes: string[] = [];

  const connections = await listConnections(supabase, userId);
  for (const conn of connections) {
    if (conn.provider === 'google') {
      const allowed = ALLOWED_EFFECTS[conn.autonomy];
      // A Google connection unlocks both Gmail and (read-only) Calendar.
      const googleTools = [...gmailTools(conn.id), ...calendarTools(conn.id)];
      const usable = googleTools.filter((t) => allowed.includes(t.sideEffect));
      tools.push(...usable);
      notes.push(
        `Google account ${conn.account_email ?? '(connected)'} — Gmail + Calendar, permission level: ${conn.autonomy.replace('_', ' ')}.`
      );
    }
  }

  return { tools, notes };
}
