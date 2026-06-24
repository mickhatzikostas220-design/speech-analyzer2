import type { SupabaseClient } from '@supabase/supabase-js';
import { getValidAccessToken } from '../google';
import type { ToolDef } from '../types';

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';

function b64urlEncode(input: string): string {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function b64urlDecode(input: string): string {
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function buildRaw(to: string, subject: string, body: string): string {
  const headers = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
  ];
  return b64urlEncode(`${headers.join('\r\n')}\r\n\r\n${body}`);
}

interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
}

function extractPlainText(payload: GmailPart | undefined): string {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return b64urlDecode(payload.body.data);
  }
  for (const part of payload.parts ?? []) {
    const text = extractPlainText(part);
    if (text) return text;
  }
  return '';
}

// Build the Gmail tools bound to a specific connection. autonomy gating happens
// in the registry — this just declares what each tool does.
export function gmailTools(connectionId: string, userId: string): ToolDef[] {
  async function token(supabase: SupabaseClient) {
    return getValidAccessToken(supabase, connectionId, userId);
  }

  return [
    {
      name: 'gmail_search_messages',
      description:
        "Search the user's Gmail using Gmail's search syntax (e.g. 'from:alice newer_than:7d', 'is:unread', 'subject:invoice'). Returns matching messages with id, sender, subject, date, and a snippet.",
      sideEffect: 'none',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Gmail search query.' },
          limit: { type: 'integer', description: 'Max messages (default 8, max 15).' },
        },
        required: ['query'],
      },
      async execute(args, ctx) {
        const accessToken = await token(ctx.supabase);
        const limit = Math.min(Number(args.limit) || 8, 15);
        const listRes = await fetch(
          `${GMAIL}/messages?q=${encodeURIComponent(String(args.query))}&maxResults=${limit}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!listRes.ok) return `Gmail error: ${await listRes.text()}`;
        const list = (await listRes.json()) as { messages?: { id: string }[] };
        if (!list.messages || list.messages.length === 0) return 'No matching messages.';

        const rows = await Promise.all(
          list.messages.map(async (m) => {
            const r = await fetch(
              `${GMAIL}/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
              { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            if (!r.ok) return `- id=${m.id} (failed to load)`;
            const msg = (await r.json()) as {
              snippet?: string;
              payload?: { headers?: { name: string; value: string }[] };
            };
            const h = (name: string) =>
              msg.payload?.headers?.find((x) => x.name === name)?.value ?? '';
            return `- id=${m.id} | from=${h('From')} | subject=${h('Subject')} | date=${h('Date')}\n    ${(msg.snippet ?? '').slice(0, 160)}`;
          })
        );
        return rows.join('\n');
      },
    },
    {
      name: 'gmail_read_message',
      description: 'Read the full plain-text body and headers of one Gmail message by id.',
      sideEffect: 'none',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: 'Gmail message id.' } },
        required: ['id'],
      },
      async execute(args, ctx) {
        const accessToken = await token(ctx.supabase);
        const r = await fetch(`${GMAIL}/messages/${String(args.id)}?format=full`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!r.ok) return `Gmail error: ${await r.text()}`;
        const msg = (await r.json()) as {
          snippet?: string;
          payload?: GmailPart & { headers?: { name: string; value: string }[] };
        };
        const h = (name: string) =>
          msg.payload?.headers?.find((x) => x.name === name)?.value ?? '';
        const body = extractPlainText(msg.payload) || msg.snippet || '';
        return [
          `From: ${h('From')}`,
          `To: ${h('To')}`,
          `Subject: ${h('Subject')}`,
          `Date: ${h('Date')}`,
          '',
          body.slice(0, 6000),
        ].join('\n');
      },
    },
    {
      name: 'gmail_create_draft',
      description:
        'Create a draft email in the user\'s Gmail (does NOT send it — the user reviews and sends it themselves). Use this to propose an email.',
      sideEffect: 'reversible',
      parameters: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Recipient email address.' },
          subject: { type: 'string', description: 'Email subject.' },
          body: { type: 'string', description: 'Plain-text email body.' },
        },
        required: ['to', 'subject', 'body'],
      },
      async execute(args, ctx) {
        const accessToken = await token(ctx.supabase);
        const raw = buildRaw(String(args.to), String(args.subject), String(args.body));
        const r = await fetch(`${GMAIL}/drafts`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message: { raw } }),
        });
        if (!r.ok) return `Gmail error: ${await r.text()}`;
        return `Draft created to ${args.to} — "${args.subject}". The user can review and send it from Gmail.`;
      },
    },
    {
      name: 'gmail_send_message',
      description:
        'Send an email immediately from the user\'s Gmail. Only available when the user has granted send permission. Prefer gmail_create_draft unless the user explicitly asked to send.',
      sideEffect: 'irreversible',
      parameters: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Recipient email address.' },
          subject: { type: 'string', description: 'Email subject.' },
          body: { type: 'string', description: 'Plain-text email body.' },
        },
        required: ['to', 'subject', 'body'],
      },
      async execute(args, ctx) {
        const accessToken = await token(ctx.supabase);
        const raw = buildRaw(String(args.to), String(args.subject), String(args.body));
        const r = await fetch(`${GMAIL}/messages/send`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw }),
        });
        if (!r.ok) return `Gmail error: ${await r.text()}`;
        return `Email sent to ${args.to} — "${args.subject}".`;
      },
    },
  ];
}
