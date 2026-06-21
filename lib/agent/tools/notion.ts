import { getAppKey } from '../store';
import type { ToolDef } from '../types';

export function notionTools(): ToolDef[] {
  return [
    {
      name: 'notion_search',
      description:
        "Search Notion for pages, databases, and blocks matching a query. Requires a Notion integration token.",
      sideEffect: 'none',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query.' },
          limit: { type: 'integer', description: 'Max results (default 5, max 10).' },
        },
        required: ['query'],
      },
      async execute(args, ctx) {
        const token = await getAppKey(ctx.supabase, ctx.userId, 'notion');
        if (!token)
          return 'Notion is not connected. Add your integration token in Agent → Connected Apps.';
        const limit = Math.min(Number(args.limit) || 5, 10);

        const r = await fetch('https://api.notion.com/v1/search', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: String(args.query), page_size: limit }),
        });
        if (!r.ok) return `Notion API error: ${await r.text()}`;
        const data = (await r.json()) as {
          results?: {
            id: string;
            object: string;
            url?: string;
            properties?: Record<string, { title?: { plain_text: string }[] }>;
          }[];
        };
        if (!data.results?.length) return 'No results found in Notion.';
        return data.results
          .map((item) => {
            const titleProp =
              item.properties?.title ?? item.properties?.Name ?? item.properties?.['Page'];
            const title =
              titleProp?.title?.[0]?.plain_text ?? `(${item.object} ${item.id.slice(0, 8)})`;
            return `• [${item.object}] ${title}\n  ${item.url ?? ''}`;
          })
          .join('\n');
      },
    },
    {
      name: 'notion_read_page',
      description: "Read the text content of a Notion page by its ID.",
      sideEffect: 'none',
      parameters: {
        type: 'object',
        properties: {
          page_id: {
            type: 'string',
            description: 'Notion page or block ID (from notion_search results or the page URL).',
          },
        },
        required: ['page_id'],
      },
      async execute(args, ctx) {
        const token = await getAppKey(ctx.supabase, ctx.userId, 'notion');
        if (!token)
          return 'Notion is not connected. Add your integration token in Agent → Connected Apps.';

        const r = await fetch(
          `https://api.notion.com/v1/blocks/${String(args.page_id)}/children?page_size=50`,
          { headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28' } }
        );
        if (!r.ok) return `Notion API error: ${await r.text()}`;
        const data = (await r.json()) as {
          results?: { type: string; [key: string]: unknown }[];
        };
        if (!data.results?.length) return 'Page is empty or not accessible.';

        const lines: string[] = [];
        for (const block of data.results) {
          const content = block[block.type] as
            | { rich_text?: { plain_text: string }[] }
            | undefined;
          const text = content?.rich_text?.map((t) => t.plain_text).join('') ?? '';
          if (text) lines.push(text);
        }
        return lines.join('\n') || 'Page has no readable text blocks.';
      },
    },
    {
      name: 'notion_create_page',
      description:
        "Create a new Notion page with a title and optional content inside a parent page or database.",
      sideEffect: 'reversible',
      parameters: {
        type: 'object',
        properties: {
          parent_id: {
            type: 'string',
            description: 'ID of the parent page or database where the new page will be created.',
          },
          title: { type: 'string', description: 'Page title.' },
          content: { type: 'string', description: 'Optional plain-text content for the page body.' },
        },
        required: ['parent_id', 'title'],
      },
      async execute(args, ctx) {
        const token = await getAppKey(ctx.supabase, ctx.userId, 'notion');
        if (!token)
          return 'Notion is not connected. Add your integration token in Agent → Connected Apps.';

        const body: Record<string, unknown> = {
          parent: { page_id: String(args.parent_id) },
          properties: {
            title: { title: [{ text: { content: String(args.title) } }] },
          },
        };
        if (args.content) {
          body.children = [
            {
              object: 'block',
              type: 'paragraph',
              paragraph: {
                rich_text: [{ type: 'text', text: { content: String(args.content) } }],
              },
            },
          ];
        }

        const r = await fetch('https://api.notion.com/v1/pages', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
        if (!r.ok) return `Notion API error: ${await r.text()}`;
        const page = (await r.json()) as { url?: string };
        return `Notion page "${args.title}" created.${page.url ? ` View: ${page.url}` : ''}`;
      },
    },
  ];
}
