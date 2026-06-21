import type { SupabaseClient } from '@supabase/supabase-js';
import { getValidAccessToken } from '../google';
import { getMsAccessToken } from '../microsoft';
import type { ToolDef } from '../types';

function fmtDate(d: string | undefined): string {
  if (!d) return 'unknown';
  try {
    return new Date(d).toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    });
  } catch {
    return d;
  }
}

export function googleCalendarTools(connectionId: string): ToolDef[] {
  async function token(supabase: SupabaseClient) {
    return getValidAccessToken(supabase, connectionId);
  }

  return [
    {
      name: 'google_calendar_list_events',
      description:
        "List upcoming events from the user's Google Calendar. Returns title, date, location, and attendees.",
      sideEffect: 'none',
      parameters: {
        type: 'object',
        properties: {
          days: { type: 'integer', description: 'Days ahead to look (default 7, max 30).' },
          max: { type: 'integer', description: 'Max events (default 10).' },
        },
        required: [],
      },
      async execute(args, ctx) {
        const accessToken = await token(ctx.supabase);
        const days = Math.min(Number(args.days) || 7, 30);
        const max = Math.min(Number(args.max) || 10, 20);
        const now = new Date().toISOString();
        const end = new Date(Date.now() + days * 86400_000).toISOString();
        const url =
          `https://www.googleapis.com/calendar/v3/calendars/primary/events` +
          `?timeMin=${encodeURIComponent(now)}&timeMax=${encodeURIComponent(end)}` +
          `&maxResults=${max}&orderBy=startTime&singleEvents=true`;
        const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (!r.ok) return `Google Calendar error: ${await r.text()}`;
        const data = (await r.json()) as {
          items?: {
            summary?: string;
            start?: { dateTime?: string; date?: string };
            location?: string;
            attendees?: { email: string }[];
          }[];
        };
        if (!data.items?.length) return `No events in the next ${days} days.`;
        return data.items
          .map((e) => {
            const start = fmtDate(e.start?.dateTime ?? e.start?.date);
            const attendees = e.attendees?.map((a) => a.email).join(', ') ?? '';
            return (
              `• ${e.summary ?? '(no title)'} — ${start}` +
              (e.location ? ` @ ${e.location}` : '') +
              (attendees ? `\n  Attendees: ${attendees}` : '')
            );
          })
          .join('\n');
      },
    },
    {
      name: 'google_calendar_create_event',
      description: "Create a new event on the user's Google Calendar.",
      sideEffect: 'reversible',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Event title.' },
          start: { type: 'string', description: 'ISO 8601 start datetime (e.g. 2025-07-15T14:00:00).' },
          end: { type: 'string', description: 'ISO 8601 end datetime.' },
          description: { type: 'string', description: 'Optional description.' },
          location: { type: 'string', description: 'Optional location.' },
        },
        required: ['title', 'start', 'end'],
      },
      async execute(args, ctx) {
        const accessToken = await token(ctx.supabase);
        const r = await fetch(
          'https://www.googleapis.com/calendar/v3/calendars/primary/events',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              summary: String(args.title),
              ...(args.description ? { description: String(args.description) } : {}),
              ...(args.location ? { location: String(args.location) } : {}),
              start: { dateTime: String(args.start), timeZone: 'UTC' },
              end: { dateTime: String(args.end), timeZone: 'UTC' },
            }),
          }
        );
        if (!r.ok) return `Google Calendar error: ${await r.text()}`;
        const ev = (await r.json()) as { htmlLink?: string };
        return `Event "${args.title}" created.${ev.htmlLink ? ` View: ${ev.htmlLink}` : ''}`;
      },
    },
  ];
}

export function microsoftCalendarTools(connectionId: string): ToolDef[] {
  async function token(supabase: SupabaseClient) {
    return getMsAccessToken(supabase, connectionId);
  }

  return [
    {
      name: 'outlook_calendar_list_events',
      description: 'List upcoming events from the Outlook / Microsoft 365 Calendar.',
      sideEffect: 'none',
      parameters: {
        type: 'object',
        properties: {
          days: { type: 'integer', description: 'Days ahead to look (default 7, max 30).' },
          max: { type: 'integer', description: 'Max events (default 10).' },
        },
        required: [],
      },
      async execute(args, ctx) {
        const accessToken = await token(ctx.supabase);
        const days = Math.min(Number(args.days) || 7, 30);
        const max = Math.min(Number(args.max) || 10, 20);
        const now = new Date().toISOString();
        const end = new Date(Date.now() + days * 86400_000).toISOString();
        const url =
          `https://graph.microsoft.com/v1.0/me/calendarView` +
          `?startDateTime=${encodeURIComponent(now)}&endDateTime=${encodeURIComponent(end)}` +
          `&$top=${max}&$orderby=start/dateTime`;
        const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (!r.ok) return `Outlook Calendar error: ${await r.text()}`;
        const data = (await r.json()) as {
          value?: {
            subject?: string;
            start?: { dateTime: string };
            location?: { displayName?: string };
            attendees?: { emailAddress: { address: string } }[];
          }[];
        };
        if (!data.value?.length) return `No events in the next ${days} days.`;
        return data.value
          .map((e) => {
            const start = fmtDate(e.start?.dateTime);
            const attendees = e.attendees?.map((a) => a.emailAddress.address).join(', ') ?? '';
            return (
              `• ${e.subject ?? '(no title)'} — ${start}` +
              (e.location?.displayName ? ` @ ${e.location.displayName}` : '') +
              (attendees ? `\n  Attendees: ${attendees}` : '')
            );
          })
          .join('\n');
      },
    },
    {
      name: 'outlook_calendar_create_event',
      description: "Create a new event on the user's Outlook Calendar.",
      sideEffect: 'reversible',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Event title.' },
          start: { type: 'string', description: 'ISO 8601 start datetime.' },
          end: { type: 'string', description: 'ISO 8601 end datetime.' },
          description: { type: 'string', description: 'Optional body/description.' },
          location: { type: 'string', description: 'Optional location.' },
        },
        required: ['title', 'start', 'end'],
      },
      async execute(args, ctx) {
        const accessToken = await token(ctx.supabase);
        const r = await fetch('https://graph.microsoft.com/v1.0/me/events', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            subject: String(args.title),
            ...(args.description
              ? { body: { contentType: 'Text', content: String(args.description) } }
              : {}),
            ...(args.location ? { location: { displayName: String(args.location) } } : {}),
            start: { dateTime: String(args.start), timeZone: 'UTC' },
            end: { dateTime: String(args.end), timeZone: 'UTC' },
          }),
        });
        if (!r.ok) return `Outlook Calendar error: ${await r.text()}`;
        return `Event "${args.title}" created on Outlook Calendar.`;
      },
    },
  ];
}
