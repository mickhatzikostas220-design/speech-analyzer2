import type { SupabaseClient } from '@supabase/supabase-js';
import type { Autonomy, SideEffect, ToolDef } from '../types';
import { listConnections, listAppKeyHints } from '../store';
import { analysesTools } from './analyses';
import { gmailTools } from './gmail';
import { googleCalendarTools, microsoftCalendarTools } from './calendar';
import { microsoftMailTools } from './microsoft-mail';
import { socialAnalyticsTools, SOCIAL_TOOL_APP_MAP } from './social-analytics';
import { notionTools } from './notion';
import { slackTools } from './slack';
import { dropboxTools } from './dropbox';

const ALLOWED_EFFECTS: Record<Autonomy, SideEffect[]> = {
  read_only: ['none'],
  draft_confirm: ['none', 'reversible'],
  act_directly: ['none', 'reversible', 'irreversible'],
};

export async function buildTools(
  supabase: SupabaseClient,
  userId: string
): Promise<{ tools: ToolDef[]; notes: string[] }> {
  const tools: ToolDef[] = [...analysesTools];
  const notes: string[] = [];

  const [connections, appKeyHints] = await Promise.all([
    listConnections(supabase, userId),
    listAppKeyHints(supabase, userId),
  ]);

  // ── OAuth-based connections (Google, Microsoft) ───────────────────────────
  for (const conn of connections) {
    const allowed = ALLOWED_EFFECTS[conn.autonomy];
    const label = conn.account_email ?? '(connected)';

    if (conn.provider === 'google') {
      const gmail = gmailTools(conn.id).filter((t) => allowed.includes(t.sideEffect));
      tools.push(...gmail);
      const cal = googleCalendarTools(conn.id).filter((t) => allowed.includes(t.sideEffect));
      tools.push(...cal);
      notes.push(
        `Google account ${label} — ${conn.autonomy.replace('_', ' ')} (Gmail + Calendar).`
      );
    }

    if (conn.provider === 'microsoft') {
      const mail = microsoftMailTools(conn.id).filter((t) => allowed.includes(t.sideEffect));
      tools.push(...mail);
      const cal = microsoftCalendarTools(conn.id).filter((t) => allowed.includes(t.sideEffect));
      tools.push(...cal);
      notes.push(
        `Microsoft account ${label} — ${conn.autonomy.replace('_', ' ')} (Outlook + Calendar).`
      );
    }
  }

  // ── Social analytics (only for platforms that have a key stored) ──────────
  const allSocial = socialAnalyticsTools();
  const connectedSocial: string[] = [];
  for (const tool of allSocial) {
    const prefix = Object.keys(SOCIAL_TOOL_APP_MAP).find((p) => tool.name.startsWith(p));
    if (prefix && appKeyHints[SOCIAL_TOOL_APP_MAP[prefix]]) {
      tools.push(tool);
      connectedSocial.push(SOCIAL_TOOL_APP_MAP[prefix]);
    }
  }
  if (connectedSocial.length > 0) {
    notes.push(`Social analytics: ${Array.from(new Set(connectedSocial)).join(', ')}.`);
  }

  // ── Notion ────────────────────────────────────────────────────────────────
  if (appKeyHints['notion']) {
    tools.push(...notionTools());
    notes.push('Notion connected.');
  }

  // ── Slack ─────────────────────────────────────────────────────────────────
  if (appKeyHints['slack']) {
    tools.push(...slackTools());
    notes.push('Slack connected.');
  }

  // ── Dropbox ───────────────────────────────────────────────────────────────
  if (appKeyHints['dropbox']) {
    tools.push(...dropboxTools());
    notes.push('Dropbox connected.');
  }

  return { tools, notes };
}
