import type { SupabaseClient } from '@supabase/supabase-js';
import { decrypt, encrypt } from '@/lib/crypto';
import { DEFAULT_MODEL } from './models';
import type { Autonomy, Provider } from './types';

export interface AgentSettings {
  provider: Provider;
  model: string;
  system_prompt: string | null;
}

export interface ConnectionRow {
  id: string;
  provider: string;
  account_email: string | null;
  scopes: string | null;
  autonomy: Autonomy;
  token_expires_at: string | null;
  created_at: string;
}

export async function getSettings(
  supabase: SupabaseClient,
  userId: string
): Promise<AgentSettings> {
  const { data } = await supabase
    .from('agent_settings')
    .select('provider, model, system_prompt')
    .eq('user_id', userId)
    .maybeSingle();

  if (!data) {
    return { provider: 'anthropic', model: DEFAULT_MODEL.anthropic, system_prompt: null };
  }
  return data as AgentSettings;
}

export async function saveSettings(
  supabase: SupabaseClient,
  userId: string,
  patch: Partial<AgentSettings>
): Promise<void> {
  await supabase
    .from('agent_settings')
    .upsert(
      { user_id: userId, ...patch, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
}

// Returns the decrypted API key for the active provider, or null if not set.
export async function getApiKey(
  supabase: SupabaseClient,
  userId: string,
  provider: Provider
): Promise<string | null> {
  const { data } = await supabase
    .from('agent_api_keys')
    .select('encrypted_key')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle();
  if (!data) return null;
  try {
    return decrypt(data.encrypted_key as string);
  } catch {
    return null;
  }
}

export async function saveApiKey(
  supabase: SupabaseClient,
  userId: string,
  provider: Provider,
  key: string
): Promise<void> {
  const hint = key.slice(-4);
  await supabase.from('agent_api_keys').upsert(
    {
      user_id: userId,
      provider,
      encrypted_key: encrypt(key),
      key_hint: hint,
      created_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,provider' }
  );
}

export async function deleteApiKey(
  supabase: SupabaseClient,
  userId: string,
  provider: Provider
): Promise<void> {
  await supabase
    .from('agent_api_keys')
    .delete()
    .eq('user_id', userId)
    .eq('provider', provider);
}

// Provider -> last 4 chars, for display in settings.
export async function listKeyHints(
  supabase: SupabaseClient,
  userId: string
): Promise<Record<string, string>> {
  const { data } = await supabase
    .from('agent_api_keys')
    .select('provider, key_hint')
    .eq('user_id', userId);
  const out: Record<string, string> = {};
  for (const row of data ?? []) out[row.provider as string] = row.key_hint as string;
  return out;
}

export async function listConnections(
  supabase: SupabaseClient,
  userId: string
): Promise<ConnectionRow[]> {
  const { data } = await supabase
    .from('agent_connections')
    .select('id, provider, account_email, scopes, autonomy, token_expires_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  return (data ?? []) as ConnectionRow[];
}

export async function logAction(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string | null,
  tool: string,
  args: Record<string, unknown>,
  status: 'executed' | 'failed',
  result: string
): Promise<void> {
  await supabase.from('agent_actions').insert({
    user_id: userId,
    conversation_id: conversationId,
    tool,
    args,
    status,
    result: result.slice(0, 2000),
  });
}
