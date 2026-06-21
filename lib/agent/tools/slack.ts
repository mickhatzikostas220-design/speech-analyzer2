import { getAppKey } from '../store';
import type { ToolDef } from '../types';

export function slackTools(): ToolDef[] {
  return [
    {
      name: 'slack_list_channels',
      description: "List channels in the connected Slack workspace. Requires a bot token.",
      sideEffect: 'none',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', description: 'Max channels to return (default 20).' },
        },
        required: [],
      },
      async execute(args, ctx) {
        const token = await getAppKey(ctx.supabase, ctx.userId, 'slack');
        if (!token)
          return 'Slack is not connected. Add your bot token in Agent → Connected Apps.';
        const limit = Math.min(Number(args.limit) || 20, 50);

        const r = await fetch(
          `https://slack.com/api/conversations.list?limit=${limit}&types=public_channel,private_channel`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!r.ok) return `Slack API error: ${await r.text()}`;
        const data = (await r.json()) as {
          ok: boolean;
          error?: string;
          channels?: { id: string; name: string; num_members?: number; is_private?: boolean }[];
        };
        if (!data.ok) return `Slack error: ${data.error}`;
        if (!data.channels?.length) return 'No channels found.';
        return data.channels
          .map(
            (c) =>
              `#${c.name} (${c.is_private ? 'private' : 'public'}, ${c.num_members ?? '?'} members) — id=${c.id}`
          )
          .join('\n');
      },
    },
    {
      name: 'slack_search_messages',
      description:
        "Search Slack messages. Supports Slack search modifiers (from:@user, in:#channel, after:YYYY-MM-DD). Requires a user token with search:read scope.",
      sideEffect: 'none',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Slack search query.' },
          count: { type: 'integer', description: 'Max results (default 5, max 20).' },
        },
        required: ['query'],
      },
      async execute(args, ctx) {
        const token = await getAppKey(ctx.supabase, ctx.userId, 'slack');
        if (!token)
          return 'Slack is not connected. Add your token in Agent → Connected Apps.';
        const count = Math.min(Number(args.count) || 5, 20);

        const r = await fetch(
          `https://slack.com/api/search.messages?query=${encodeURIComponent(String(args.query))}&count=${count}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!r.ok) return `Slack API error: ${await r.text()}`;
        const data = (await r.json()) as {
          ok: boolean;
          error?: string;
          messages?: {
            matches?: {
              text: string;
              username: string;
              channel?: { name: string };
              ts: string;
            }[];
          };
        };
        if (!data.ok) return `Slack error: ${data.error}`;
        const matches = data.messages?.matches ?? [];
        if (!matches.length) return 'No messages found.';
        return matches
          .map((m) => {
            const ts = new Date(Number(m.ts.split('.')[0]) * 1000).toLocaleString();
            return `• [${ts}] @${m.username} in #${m.channel?.name ?? '?'}: "${m.text.slice(0, 200)}"`;
          })
          .join('\n');
      },
    },
    {
      name: 'slack_post_message',
      description:
        "Post a message to a Slack channel. Use the channel id from slack_list_channels.",
      sideEffect: 'irreversible',
      parameters: {
        type: 'object',
        properties: {
          channel: { type: 'string', description: 'Channel ID (e.g. C01234ABCDE).' },
          text: { type: 'string', description: 'Message text to post.' },
        },
        required: ['channel', 'text'],
      },
      async execute(args, ctx) {
        const token = await getAppKey(ctx.supabase, ctx.userId, 'slack');
        if (!token)
          return 'Slack is not connected. Add your token in Agent → Connected Apps.';

        const r = await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ channel: String(args.channel), text: String(args.text) }),
        });
        if (!r.ok) return `Slack API error: ${await r.text()}`;
        const data = (await r.json()) as { ok: boolean; error?: string };
        if (!data.ok) return `Slack error: ${data.error}`;
        return `Message posted to channel ${args.channel}.`;
      },
    },
  ];
}
