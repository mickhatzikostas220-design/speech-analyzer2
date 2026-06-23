import type { SupabaseClient } from '@supabase/supabase-js';
import { getValidAccessToken } from '../google';
import type { ToolDef } from '../types';

const DRIVE = 'https://www.googleapis.com/drive/v3';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  owners?: { displayName?: string }[];
}

// Build the read-only Google Drive tools bound to a Google connection. All Drive
// tools are read-only (sideEffect 'none'), so they're available at every autonomy
// level — connecting Google is enough.
export function driveTools(connectionId: string): ToolDef[] {
  async function token(supabase: SupabaseClient) {
    return getValidAccessToken(supabase, connectionId);
  }

  return [
    {
      name: 'drive_search_files',
      description:
        "Search the user's Google Drive by name or full-text content. Pass a plain query string (e.g. 'keynote outline', 'Q3 report'). Returns matching files with id, name, type, and modified date.",
      sideEffect: 'none',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'What to look for (file name or content keywords).' },
          limit: { type: 'integer', description: 'Max files (default 10, max 20).' },
        },
        required: ['query'],
      },
      async execute(args, ctx) {
        const accessToken = await token(ctx.supabase);
        const limit = Math.min(Number(args.limit) || 10, 20);
        const raw = String(args.query).replace(/'/g, "\\'");
        // Match either the name or full text, excluding trashed files.
        const q = `trashed = false and (name contains '${raw}' or fullText contains '${raw}')`;
        const url =
          `${DRIVE}/files?q=${encodeURIComponent(q)}&pageSize=${limit}` +
          `&fields=${encodeURIComponent('files(id,name,mimeType,modifiedTime,owners(displayName))')}` +
          `&orderBy=modifiedTime desc`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (!res.ok) return `Drive error: ${await res.text()}`;
        const data = (await res.json()) as { files?: DriveFile[] };
        if (!data.files || data.files.length === 0) return 'No matching files.';
        return data.files
          .map(
            (f) =>
              `- id=${f.id} | name=${f.name} | type=${f.mimeType.replace('application/vnd.google-apps.', 'google-')} | modified=${f.modifiedTime ?? '?'}`
          )
          .join('\n');
      },
    },
    {
      name: 'drive_read_file',
      description:
        'Read the text content of one Google Drive file by id. Works for Google Docs/Sheets/Slides (exported as text) and plain-text files. Use drive_search_files first to find the id.',
      sideEffect: 'none',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: 'Drive file id.' } },
        required: ['id'],
      },
      async execute(args, ctx) {
        const accessToken = await token(ctx.supabase);
        const id = String(args.id);
        const headers = { Authorization: `Bearer ${accessToken}` };

        // Find out what kind of file it is.
        const metaRes = await fetch(`${DRIVE}/files/${id}?fields=name,mimeType`, { headers });
        if (!metaRes.ok) return `Drive error: ${await metaRes.text()}`;
        const meta = (await metaRes.json()) as { name: string; mimeType: string };

        let contentRes: Response;
        if (meta.mimeType.startsWith('application/vnd.google-apps.')) {
          // Native Google file — export to a text format.
          const exportMime =
            meta.mimeType === 'application/vnd.google-apps.spreadsheet'
              ? 'text/csv'
              : 'text/plain';
          contentRes = await fetch(
            `${DRIVE}/files/${id}/export?mimeType=${encodeURIComponent(exportMime)}`,
            { headers }
          );
        } else if (meta.mimeType.startsWith('text/') || meta.mimeType === 'application/json') {
          contentRes = await fetch(`${DRIVE}/files/${id}?alt=media`, { headers });
        } else {
          return `“${meta.name}” is a ${meta.mimeType} file, which can’t be read as text.`;
        }

        if (!contentRes.ok) return `Drive error: ${await contentRes.text()}`;
        const text = await contentRes.text();
        return `File: ${meta.name}\n\n${text.slice(0, 8000)}`;
      },
    },
  ];
}
