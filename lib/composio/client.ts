import { Composio } from '@composio/core';

// Thin wrapper around the Composio SDK (@composio/core). Composio brokers OAuth
// and tool execution for 250+ third-party apps ("toolkits"). This integration
// is bring-your-own-key: every call takes the user's own Composio API key, and
// each Orator user is a Composio `userId` (their Supabase id) so connections and
// tool runs are always scoped to that person.
//
// We deliberately use the SDK's raw/provider-agnostic surface
// (`tools.getRawComposioTools`, `tools.execute`) and adapt the results onto the
// agent's existing ToolDef shape ourselves, rather than pulling in a
// provider-specific wrapper — the agent already speaks both Anthropic & OpenAI.

export interface ComposioRawTool {
  slug: string;
  name: string;
  description?: string;
  inputParameters?: Record<string, unknown>;
}

export interface ComposioToolkitSummary {
  slug: string;
  name: string;
  description?: string;
  logo?: string;
}

export interface ComposioConnectedAccount {
  id: string;
  toolkit: string; // lowercase slug, e.g. "gmail"
  status: string;
}

function client(apiKey: string): Composio {
  return new Composio({ apiKey });
}

// Cheap call used to validate a pasted key before we store it.
export async function validateApiKey(apiKey: string): Promise<string | null> {
  try {
    await client(apiKey).toolkits.get({ limit: 1 });
    return null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return /401|403|unauthor|invalid|api key|forbidden/i.test(msg)
      ? 'That Composio API key was rejected.'
      : `Could not validate the key: ${msg}`;
  }
}

// A curated set of popular toolkits to offer in the connect picker, optionally
// narrowed by a search term against Composio's catalog. Kept small so the UI
// stays fast and focused on what a speaker is likely to want.
const FEATURED_TOOLKITS = [
  'gmail',
  'googlecalendar',
  'googledrive',
  'googlesheets',
  'googledocs',
  'slack',
  'notion',
  'linear',
  'github',
  'asana',
  'trello',
  'hubspot',
  'twitter',
  'discord',
];

export async function listConnectableToolkits(
  apiKey: string,
  search?: string
): Promise<ComposioToolkitSummary[]> {
  const co = client(apiKey);
  const res = await co.toolkits.get({ limit: 200, sortBy: 'usage' });
  const items: ComposioToolkitSummary[] = (Array.isArray(res) ? res : []).map((t) => ({
    slug: String(t.slug).toLowerCase(),
    name: t.name as string,
    description: t.meta?.description,
    logo: t.meta?.logo,
  }));

  // The catalog endpoint has no text search, so filter by name/slug ourselves.
  if (search) {
    const q = search.toLowerCase();
    return items.filter((t) => t.slug.includes(q) || t.name.toLowerCase().includes(q)).slice(0, 30);
  }

  // No search: surface the featured set first (in catalog order), preserving
  // their metadata when present.
  const bySlug = new Map(items.map((t) => [t.slug, t]));
  return FEATURED_TOOLKITS.map((slug) => bySlug.get(slug)).filter(
    (t): t is ComposioToolkitSummary => Boolean(t)
  );
}

export async function listConnectedAccounts(
  apiKey: string,
  userId: string
): Promise<ComposioConnectedAccount[]> {
  const res = await client(apiKey).connectedAccounts.list({
    userIds: [userId],
    statuses: ['ACTIVE'],
  });
  return (res.items ?? []).map((a) => ({
    id: a.id,
    toolkit: String(a.toolkit?.slug ?? '').toLowerCase(),
    status: String(a.status),
  }));
}

// Find a reusable auth config for the toolkit, or create one backed by
// Composio-managed auth (no need for the user to register their own OAuth app
// for the common toolkits). Returns the auth config id.
async function ensureAuthConfig(co: Composio, toolkit: string): Promise<string> {
  try {
    const existing = await co.authConfigs.list({ toolkit });
    const enabled = (existing.items ?? []).find((c) => c.status !== 'DISABLED');
    if (enabled) return enabled.id;
  } catch {
    // Fall through to creation.
  }
  const created = await co.authConfigs.create(toolkit, {
    type: 'use_composio_managed_auth',
  });
  return created.id;
}

// Kick off an OAuth connection for a toolkit. Returns the hosted Composio URL
// the user must visit and the pending connected-account id. Composio redirects
// back to `callbackUrl` once the user authorizes.
export async function initiateConnection(
  apiKey: string,
  userId: string,
  toolkit: string,
  callbackUrl: string
): Promise<{ redirectUrl: string | null; connectedAccountId: string }> {
  const co = client(apiKey);
  const authConfigId = await ensureAuthConfig(co, toolkit);
  const req = await co.connectedAccounts.initiate(userId, authConfigId, { callbackUrl });
  return { redirectUrl: req.redirectUrl ?? null, connectedAccountId: req.id };
}

export async function disconnectAccount(
  apiKey: string,
  connectedAccountId: string
): Promise<void> {
  await client(apiKey).connectedAccounts.delete(connectedAccountId);
}

// Fetch the most important tools for a connected toolkit, scoped to the user.
export async function getToolkitTools(
  apiKey: string,
  userId: string,
  toolkit: string,
  limit = 12
): Promise<ComposioRawTool[]> {
  const tools = await client(apiKey).tools.getRawComposioTools({
    toolkits: [toolkit],
    important: true,
    limit,
  });
  return (tools ?? []).map((t) => ({
    slug: t.slug,
    name: t.name,
    description: t.description,
    inputParameters: t.inputParameters as Record<string, unknown> | undefined,
  }));
}

export interface ComposioExecuteResult {
  successful: boolean;
  data: Record<string, unknown>;
  error: string | null;
}

export async function executeTool(
  apiKey: string,
  userId: string,
  slug: string,
  args: Record<string, unknown>
): Promise<ComposioExecuteResult> {
  const res = await client(apiKey).tools.execute(slug, { userId, arguments: args });
  return { successful: res.successful, data: res.data, error: res.error };
}
