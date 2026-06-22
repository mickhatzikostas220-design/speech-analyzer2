import { ALLOWED_EFFECTS, type Autonomy, type SideEffect, type ToolDef } from '@/lib/agent/types';
import { executeTool, getToolkitTools, type ComposioRawTool } from './client';

// Adapts a user's connected Composio toolkits into the agent's ToolDef shape,
// gated by the autonomy granted to each connection. Composio doesn't label a
// tool's risk, so we infer a SideEffect from the action verb in its slug and
// reuse the same read-only / draft / act-directly gating as the built-in tools.

interface ConnectionInput {
  toolkit: string;
  autonomy: Autonomy;
}

// Verb → risk classification, checked against the words in a tool slug.
const READ_VERBS = [
  'GET', 'LIST', 'FETCH', 'SEARCH', 'READ', 'FIND', 'RETRIEVE', 'COUNT',
  'CHECK', 'DOWNLOAD', 'EXPORT', 'VIEW', 'LOOKUP',
];
const IRREVERSIBLE_VERBS = [
  'DELETE', 'REMOVE', 'SEND', 'ARCHIVE', 'TRASH', 'CANCEL', 'REVOKE', 'DESTROY',
];

// Classify a Composio tool's side effect from its slug. Irreversible wins over
// read; anything we can't confidently call a read defaults to "reversible" so
// it stays hidden from read-only connections (the safe choice).
function classify(slug: string, toolkit: string): SideEffect {
  const action = slug.toUpperCase().replace(`${toolkit.toUpperCase()}_`, '');
  const words = action.split('_');
  if (words.some((w) => IRREVERSIBLE_VERBS.includes(w))) return 'irreversible';
  if (words.some((w) => READ_VERBS.includes(w))) return 'none';
  return 'reversible';
}

// OpenAI/Anthropic tool names allow [a-zA-Z0-9_-], max 64 chars. Composio slugs
// already fit, but sanitize defensively.
function sanitizeName(slug: string): string {
  return slug.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
}

function toToolDef(apiKey: string, tool: ComposioRawTool, toolkit: string): ToolDef {
  const slug = tool.slug;
  return {
    name: sanitizeName(slug),
    description: tool.description || tool.name,
    parameters: tool.inputParameters ?? { type: 'object', properties: {} },
    sideEffect: classify(slug, toolkit),
    async execute(args, ctx) {
      try {
        const res = await executeTool(apiKey, ctx.userId, slug, args);
        if (!res.successful) return `Error: ${res.error ?? 'tool execution failed'}`;
        const json = JSON.stringify(res.data ?? {});
        return json.length > 6000 ? `${json.slice(0, 6000)}…` : json;
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  };
}

// Build the Composio-backed ToolDefs for all of a user's connected toolkits,
// filtered to what each connection's autonomy allows. Failures for one toolkit
// (e.g. a transient Composio error) don't sink the others.
export async function buildComposioTools(
  apiKey: string,
  userId: string,
  connections: ConnectionInput[]
): Promise<{ tools: ToolDef[]; notes: string[] }> {
  const tools: ToolDef[] = [];
  const notes: string[] = [];

  const results = await Promise.all(
    connections.map(async (conn) => {
      try {
        const raw = await getToolkitTools(apiKey, userId, conn.toolkit);
        const allowed = ALLOWED_EFFECTS[conn.autonomy];
        const defs = raw
          .map((t) => toToolDef(apiKey, t, conn.toolkit))
          .filter((d) => allowed.includes(d.sideEffect));
        return { conn, defs };
      } catch {
        return { conn, defs: [] as ToolDef[] };
      }
    })
  );

  for (const { conn, defs } of results) {
    tools.push(...defs);
    notes.push(
      `${conn.toolkit} (via Composio) — permission level: ${conn.autonomy.replace('_', ' ')}, ${defs.length} tool${defs.length === 1 ? '' : 's'} available.`
    );
  }

  return { tools, notes };
}
