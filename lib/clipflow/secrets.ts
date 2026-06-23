import type { SupabaseClient } from '@supabase/supabase-js';
import { decrypt, encrypt } from '@/lib/crypto';
import type { Platform } from './types';

// Per-user ClipFlow API keys / credentials (BYOK), encrypted at rest with the
// app's AES-256-GCM key (APP_ENCRYPTION_KEY — the same convention the agent's
// BYOK keys use). Ciphertext never leaves the server; callers only ever surface
// the `hint` (last 4 chars). Every resolver here falls back to the app-wide env
// var when the user hasn't supplied their own key, so existing app-level setups
// keep working unchanged.

export type SimpleSecretKind = 'openai' | 'upload_post';
export type OAuthSecretKind = `oauth_${Platform}`;
export type ClipflowSecretKind = SimpleSecretKind | OAuthSecretKind;

export const SIMPLE_SECRET_KINDS: SimpleSecretKind[] = ['openai', 'upload_post'];

export interface OAuthCreds {
  clientId: string;
  clientSecret: string;
}

export function oauthKind(platform: Platform): OAuthSecretKind {
  return `oauth_${platform}`;
}

const ALL_KINDS: ClipflowSecretKind[] = [
  'openai',
  'upload_post',
  'oauth_youtube',
  'oauth_tiktok',
  'oauth_instagram',
  'oauth_twitter',
];

export function isClipflowSecretKind(v: unknown): v is ClipflowSecretKind {
  return typeof v === 'string' && (ALL_KINDS as string[]).includes(v);
}

// ── Read ────────────────────────────────────────────────────────────────────

async function readRaw(
  supabase: SupabaseClient,
  userId: string,
  kind: ClipflowSecretKind
): Promise<string | null> {
  const { data } = await supabase
    .from('clipflow_secrets')
    .select('encrypted_value')
    .eq('user_id', userId)
    .eq('kind', kind)
    .maybeSingle();
  if (!data?.encrypted_value) return null;
  try {
    return decrypt(data.encrypted_value as string);
  } catch {
    return null;
  }
}

/** The user's own OpenAI key, or the app-wide OPENAI_API_KEY, or null. */
export async function resolveOpenAIKey(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  return (await readRaw(supabase, userId, 'openai')) || process.env.OPENAI_API_KEY || null;
}

/** The user's own Upload-Post key, or the app-wide UPLOAD_POST_API_KEY, or null. */
export async function resolveUploadPostKey(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  return (await readRaw(supabase, userId, 'upload_post')) || process.env.UPLOAD_POST_API_KEY || null;
}

const ENV_OAUTH: Record<Platform, { id: string; secret: string }> = {
  youtube: { id: 'YOUTUBE_OAUTH_CLIENT_ID', secret: 'YOUTUBE_OAUTH_CLIENT_SECRET' },
  tiktok: { id: 'TIKTOK_OAUTH_CLIENT_KEY', secret: 'TIKTOK_OAUTH_CLIENT_SECRET' },
  instagram: { id: 'INSTAGRAM_OAUTH_CLIENT_ID', secret: 'INSTAGRAM_OAUTH_CLIENT_SECRET' },
  twitter: { id: 'TWITTER_OAUTH_CLIENT_ID', secret: 'TWITTER_OAUTH_CLIENT_SECRET' },
};

/** The user's own per-platform OAuth client creds, falling back to env, or null. */
export async function resolveOAuthCreds(
  supabase: SupabaseClient,
  userId: string,
  platform: Platform
): Promise<OAuthCreds | null> {
  const raw = await readRaw(supabase, userId, oauthKind(platform));
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<OAuthCreds>;
      if (parsed.clientId && parsed.clientSecret) {
        return { clientId: parsed.clientId, clientSecret: parsed.clientSecret };
      }
    } catch {
      /* fall through to env */
    }
  }
  const env = ENV_OAUTH[platform];
  const id = process.env[env.id];
  const secret = process.env[env.secret];
  return id && secret ? { clientId: id, clientSecret: secret } : null;
}

// ── Write ─────────────────────────────────────────────────────────────────

/** Per-user key hints (last 4 chars) for display, keyed by kind. */
export async function listSecretHints(
  supabase: SupabaseClient,
  userId: string
): Promise<Record<string, string>> {
  const { data } = await supabase
    .from('clipflow_secrets')
    .select('kind, hint')
    .eq('user_id', userId);
  const out: Record<string, string> = {};
  for (const row of data ?? []) out[row.kind as string] = (row.hint as string) ?? '';
  return out;
}

async function upsert(
  supabase: SupabaseClient,
  userId: string,
  kind: ClipflowSecretKind,
  value: string,
  hint: string
): Promise<void> {
  await supabase.from('clipflow_secrets').upsert(
    {
      user_id: userId,
      kind,
      encrypted_value: encrypt(value),
      hint,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,kind' }
  );
}

export async function saveSimpleSecret(
  supabase: SupabaseClient,
  userId: string,
  kind: SimpleSecretKind,
  key: string
): Promise<void> {
  await upsert(supabase, userId, kind, key, key.slice(-4));
}

export async function saveOAuthSecret(
  supabase: SupabaseClient,
  userId: string,
  platform: Platform,
  creds: OAuthCreds
): Promise<void> {
  await upsert(
    supabase,
    userId,
    oauthKind(platform),
    JSON.stringify(creds),
    creds.clientId.slice(-4)
  );
}

export async function deleteSecret(
  supabase: SupabaseClient,
  userId: string,
  kind: ClipflowSecretKind
): Promise<void> {
  await supabase.from('clipflow_secrets').delete().eq('user_id', userId).eq('kind', kind);
}
