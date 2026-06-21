import { getAppKey } from '../store';
import type { ToolDef } from '../types';

const DBX = 'https://api.dropboxapi.com/2';
const DBX_CONTENT = 'https://content.dropboxapi.com/2';

export function dropboxTools(): ToolDef[] {
  return [
    {
      name: 'dropbox_list_files',
      description:
        "List files and folders in a Dropbox path. Path should start with / (use '' or '/' for root).",
      sideEffect: 'none',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: "Dropbox path to list (e.g. '' for root, '/Documents' for a folder).",
          },
          limit: { type: 'integer', description: 'Max entries (default 20).' },
        },
        required: [],
      },
      async execute(args, ctx) {
        const token = await getAppKey(ctx.supabase, ctx.userId, 'dropbox');
        if (!token)
          return 'Dropbox is not connected. Add your access token in Agent → Connected Apps.';
        const limit = Math.min(Number(args.limit) || 20, 50);
        const path = String(args.path ?? '');

        const r = await fetch(`${DBX}/files/list_folder`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ path: path === '/' ? '' : path, limit }),
        });
        if (!r.ok) return `Dropbox error: ${await r.text()}`;
        const data = (await r.json()) as {
          entries?: { '.tag': string; name: string; path_lower?: string; size?: number }[];
        };
        if (!data.entries?.length) return 'Folder is empty or not found.';
        return data.entries
          .map((e) => `${e['.tag'] === 'folder' ? '[dir]' : '[file]'} ${e.name}${e.size ? ` (${(e.size / 1024).toFixed(1)} KB)` : ''} — ${e.path_lower}`)
          .join('\n');
      },
    },
    {
      name: 'dropbox_read_file',
      description: "Read the text content of a file in Dropbox (works for .txt, .md, .csv, .json, code files).",
      sideEffect: 'none',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Full Dropbox path to the file (e.g. /notes.txt).' },
        },
        required: ['path'],
      },
      async execute(args, ctx) {
        const token = await getAppKey(ctx.supabase, ctx.userId, 'dropbox');
        if (!token)
          return 'Dropbox is not connected. Add your access token in Agent → Connected Apps.';

        const r = await fetch(`${DBX_CONTENT}/files/download`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Dropbox-API-Arg': JSON.stringify({ path: String(args.path) }),
          },
        });
        if (!r.ok) return `Dropbox error: ${await r.text()}`;
        const text = await r.text();
        return text.slice(0, 8000);
      },
    },
    {
      name: 'dropbox_upload_file',
      description:
        "Upload or overwrite a text file in Dropbox. Use this to save content to the user's Dropbox.",
      sideEffect: 'reversible',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Dropbox destination path (e.g. /notes.txt).' },
          content: { type: 'string', description: 'Text content to write.' },
          overwrite: { type: 'boolean', description: 'Overwrite if file exists (default: true).' },
        },
        required: ['path', 'content'],
      },
      async execute(args, ctx) {
        const token = await getAppKey(ctx.supabase, ctx.userId, 'dropbox');
        if (!token)
          return 'Dropbox is not connected. Add your access token in Agent → Connected Apps.';

        const mode = args.overwrite === false ? 'add' : 'overwrite';
        const r = await fetch(`${DBX_CONTENT}/files/upload`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/octet-stream',
            'Dropbox-API-Arg': JSON.stringify({ path: String(args.path), mode, autorename: false }),
          },
          body: String(args.content),
        });
        if (!r.ok) return `Dropbox error: ${await r.text()}`;
        const meta = (await r.json()) as { path_display?: string };
        return `File saved to Dropbox at ${meta.path_display ?? args.path}.`;
      },
    },
  ];
}
