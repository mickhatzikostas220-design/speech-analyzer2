import type { SupabaseClient } from '@supabase/supabase-js';
import { ALLOWED_EFFECTS, type ToolDef } from '../types';
import { listConnections } from '../store';
import { analysesTools } from './analyses';
import { gmailTools } from './gmail';
import { getComposioKey, listComposioConnections } from '@/lib/composio/store';
import { buildComposioTools } from '@/lib/composio/tools';

// Assemble the tool set for a request: always the read-only speech-aware tools,
// plus tools for each connected app gated by that connection's autonomy.
export async function buildTools(
  supabase: SupabaseClient,
  userId: string
): Promise<{ tools: ToolDef[]; notes: string[] }> {
  const tools: ToolDef[] = [...analysesTools];
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

  // Composio-connected apps (bring-your-own-key). Loaded best-effort so a
  // Composio hiccup never breaks the chat — the built-in tools still work.
  try {
    const composioKey = await getComposioKey(supabase, userId);
    if (composioKey) {
      const composioConns = await listComposioConnections(supabase, userId);
      if (composioConns.length) {
        const { tools: cTools, notes: cNotes } = await buildComposioTools(
          composioKey,
          userId,
          composioConns.map((c) => ({ toolkit: c.toolkit, autonomy: c.autonomy }))
        );
        tools.push(...cTools);
        notes.push(...cNotes);
      }
    }
  } catch {
    // Ignore — Composio is additive.
  }

  return { tools, notes };
}
