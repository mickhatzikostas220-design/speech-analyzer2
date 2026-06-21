import type { SupabaseClient } from '@supabase/supabase-js';
import { encryptToken, decryptToken } from './crypto';

// Per-user Upload-Post credentials.
//
// Each ClipFlow user can bring their OWN Upload-Post account by pasting the API
// key from https://app.upload-post.com/api-keys, so their clips post to THEIR OWN
// connected social accounts. The key is stored encrypted at rest (AES-256-GCM,
// see crypto.ts) in clipflow_uploadpost_keys and is only ever decrypted
// server-side, immediately before an Upload-Post API call — it never reaches the
// browser.
//
// If a user has not added a key, an app-level UPLOAD_POST_API_KEY (when present)
// is used as a shared fallback, preserving the original single-account behaviour.

const TABLE = 'clipflow_uploadpost_keys';

export interface UploadPostCreds {
  apiKey: string;
  /** The Upload-Post "user"/profile the clip is posted under. */
  profile: string;
  /** true when the credentials are the user's own key (vs the env fallback). */
  ownKey: boolean;
}

/** Stable managed profile name for the shared/env-key fallback (unique per user). */
export function managedProfileName(userId: string): string {
  return `orator_${userId.replace(/[^a-zA-Z0-9]/g, '')}`;
}

function envKey(): string | null {
  return process.env.UPLOAD_POST_API_KEY || null;
}

/** The user's own stored credentials (decrypted), or null if they haven't set a key. */
export async function getStoredCreds(
  client: SupabaseClient,
  userId: string
): Promise<{ apiKey: string; profile: string; hint: string | null } | null> {
  const { data } = await client
    .from(TABLE)
    .select('encrypted_api_key, profile, key_hint')
    .eq('user_id', userId)
    .maybeSingle();
  if (!data?.encrypted_api_key) return null;
  try {
    return {
      apiKey: decryptToken(data.encrypted_api_key),
      profile: data.profile,
      hint: data.key_hint ?? null,
    };
  } catch {
    // A key encrypted under a since-rotated secret can't be used — treat as unset.
    return null;
  }
}

/**
 * Resolve the credentials to use for a user: their own key first, otherwise the
 * shared app-level key. Returns null when neither is available (Upload-Post off).
 */
export async function resolveCreds(
  client: SupabaseClient,
  userId: string
): Promise<UploadPostCreds | null> {
  const stored = await getStoredCreds(client, userId);
  if (stored) return { apiKey: stored.apiKey, profile: stored.profile, ownKey: true };
  const env = envKey();
  if (env) return { apiKey: env, profile: managedProfileName(userId), ownKey: false };
  return null;
}

/** Whether an app-level shared key is configured (env fallback available). */
export function sharedKeyConfigured(): boolean {
  return Boolean(envKey());
}

/** Store (or replace) the user's own Upload-Post API key + chosen profile. */
export async function saveStoredKey(
  client: SupabaseClient,
  userId: string,
  apiKey: string,
  profile: string
): Promise<void> {
  const { error } = await client.from(TABLE).upsert(
    {
      user_id: userId,
      encrypted_api_key: encryptToken(apiKey),
      profile,
      key_hint: apiKey.slice(-4),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );
  if (error) throw new Error(error.message);
}

/** Forget the user's own key (best-effort; non-destructive to their Upload-Post account). */
export async function deleteStoredKey(client: SupabaseClient, userId: string): Promise<void> {
  await client.from(TABLE).delete().eq('user_id', userId);
}
