import type { SupabaseClient } from '@supabase/supabase-js';
import { getMsAccessToken } from '../microsoft';
import type { ToolDef } from '../types';

const GRAPH = 'https://graph.microsoft.com/v1.0';

export function microsoftMailTools(connectionId: string): ToolDef[] {
  async function token(supabase: SupabaseClient) {
    return getMsAccessToken(supabase, connectionId);
  }

  return [
    {
      name: 'outlook_search_emails',
      description:
        "Search Outlook emails by keyword. Returns sender, subject, date, and a preview snippet.",
      sideEffect: 'none',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search keywords.' },
          limit: { type: 'integer', description: 'Max results (default 8, max 15).' },
        },
        required: ['query'],
      },
      async execute(args, ctx) {
        const accessToken = await token(ctx.supabase);
        const limit = Math.min(Number(args.limit) || 8, 15);
        const r = await fetch(
          `${GRAPH}/me/messages?$search="${encodeURIComponent(String(args.query))}"&$top=${limit}&$select=id,subject,from,receivedDateTime,bodyPreview`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!r.ok) return `Outlook error: ${await r.text()}`;
        const data = (await r.json()) as {
          value?: {
            id: string;
            subject?: string;
            from?: { emailAddress?: { address?: string } };
            receivedDateTime?: string;
            bodyPreview?: string;
          }[];
        };
        if (!data.value?.length) return 'No messages found.';
        return data.value
          .map(
            (m) =>
              `- id=${m.id} | from=${m.from?.emailAddress?.address} | subject=${m.subject} | ${m.receivedDateTime}\n  ${(m.bodyPreview ?? '').slice(0, 160)}`
          )
          .join('\n');
      },
    },
    {
      name: 'outlook_read_email',
      description: 'Read the full body of one Outlook email by its id.',
      sideEffect: 'none',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: 'Message id from outlook_search_emails.' } },
        required: ['id'],
      },
      async execute(args, ctx) {
        const accessToken = await token(ctx.supabase);
        const r = await fetch(
          `${GRAPH}/me/messages/${String(args.id)}?$select=subject,from,toRecipients,receivedDateTime,body`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!r.ok) return `Outlook error: ${await r.text()}`;
        const m = (await r.json()) as {
          subject?: string;
          from?: { emailAddress?: { address?: string } };
          toRecipients?: { emailAddress?: { address?: string } }[];
          receivedDateTime?: string;
          body?: { content?: string };
        };
        const to = m.toRecipients?.map((t) => t.emailAddress?.address).join(', ') ?? '';
        const text = (m.body?.content ?? '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        return [
          `From: ${m.from?.emailAddress?.address}`,
          `To: ${to}`,
          `Subject: ${m.subject}`,
          `Date: ${m.receivedDateTime}`,
          '',
          text.slice(0, 6000),
        ].join('\n');
      },
    },
    {
      name: 'outlook_create_draft',
      description:
        "Create a draft email in Outlook (does NOT send — the user reviews it in their Drafts folder).",
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
        const r = await fetch(`${GRAPH}/me/messages`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            subject: String(args.subject),
            body: { contentType: 'Text', content: String(args.body) },
            toRecipients: [{ emailAddress: { address: String(args.to) } }],
          }),
        });
        if (!r.ok) return `Outlook error: ${await r.text()}`;
        return `Draft created to ${args.to} — "${args.subject}". Check your Drafts folder in Outlook.`;
      },
    },
    {
      name: 'outlook_send_email',
      description:
        "Send an email via Outlook immediately. Only use when the user explicitly asks to send (not just draft).",
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
        const r = await fetch(`${GRAPH}/me/sendMail`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              subject: String(args.subject),
              body: { contentType: 'Text', content: String(args.body) },
              toRecipients: [{ emailAddress: { address: String(args.to) } }],
            },
          }),
        });
        if (!r.ok) return `Outlook error: ${await r.text()}`;
        return `Email sent to ${args.to} — "${args.subject}".`;
      },
    },
  ];
}
