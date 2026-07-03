import type { SupabaseClient } from '@supabase/supabase-js';
import { getValidAccessToken } from '../google';
import type { ToolDef } from '../types';

const CAL = 'https://www.googleapis.com/calendar/v3';

interface GCalEvent {
  id?: string;
  summary?: string;
  status?: string;
  location?: string;
  htmlLink?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { email?: string; responseStatus?: string }[];
}

function when(e: GCalEvent): string {
  const s = e.start?.dateTime || e.start?.date || '';
  const en = e.end?.dateTime || e.end?.date || '';
  return en ? `${s} → ${en}` : s;
}

// Read-only Google Calendar tools, bound to a connected Google account. The
// connection's Calendar scope is granted via the shared Google consent flow;
// accounts connected before Calendar was added must reconnect once.
export function calendarTools(connectionId: string, userId?: string): ToolDef[] {
  async function token(supabase: SupabaseClient) {
    return getValidAccessToken(supabase, connectionId, userId);
  }

  return [
    {
      name: 'calendar_list_events',
      description:
        "List upcoming events from the user's Google Calendar. Optionally filter with a free-text query or a future window. Returns each event's title, time, location, and attendees. Read-only.",
      sideEffect: 'none',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Optional free-text search (matches title, attendees, etc.).' },
          days_ahead: {
            type: 'integer',
            description: 'How many days from now to look ahead (default 7, max 90).',
          },
          limit: { type: 'integer', description: 'Max events (default 10, max 25).' },
        },
      },
      async execute(args, ctx) {
        const accessToken = await token(ctx.supabase);
        const limit = Math.min(Number(args.limit) || 10, 25);
        const daysAhead = Math.min(Number(args.days_ahead) || 7, 90);
        const timeMin = new Date().toISOString();
        const timeMax = new Date(Date.now() + daysAhead * 86400_000).toISOString();

        const params = new URLSearchParams({
          timeMin,
          timeMax,
          singleEvents: 'true',
          orderBy: 'startTime',
          maxResults: String(limit),
        });
        if (args.query) params.set('q', String(args.query));

        const res = await fetch(`${CAL}/calendars/primary/events?${params.toString()}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) {
          const body = await res.text();
          if (res.status === 401 || res.status === 403) {
            return `Calendar error: access not granted. Reconnect your Google account in Agent settings to allow Calendar (read-only). (${body.slice(0, 200)})`;
          }
          return `Calendar error: ${body}`;
        }
        const data = (await res.json()) as { items?: GCalEvent[] };
        const items = data.items ?? [];
        if (items.length === 0) return `No events in the next ${daysAhead} days.`;

        return items
          .map((e) => {
            const who = (e.attendees ?? [])
              .map((a) => a.email)
              .filter(Boolean)
              .slice(0, 5)
              .join(', ');
            return `- ${e.summary || '(no title)'} | ${when(e)}${e.location ? ` | @ ${e.location}` : ''}${
              who ? ` | with ${who}` : ''
            }`;
          })
          .join('\n');
      },
    },
  ];
}
