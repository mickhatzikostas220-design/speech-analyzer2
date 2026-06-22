import type { SupabaseClient } from '@supabase/supabase-js';
import { decrypt, encrypt } from '@/lib/crypto';
import type { Autonomy } from '@/lib/agent/types';

// Persistence for the Composio integration. The API key reuses the encrypted
// agent_api_keys table (provider = 'composio'); the per-toolkit connections +
// their granted autonomy live in agent_composio_connections.

const PROVIDER = 'composio';

export interface ComposioConnectionRow {
  id: string;
  toolkit: string;
  connected_account_id: string;
  account_label: string | null;
  autonomy: Autonomy;
  created_at: string;
}

export async function getComposioKey(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('agent_api_keys')
    .select('encrypted_key')
    .eq('user_id', userId)
    .eq('provider', PROVIDER)
    .maybeSingle();
  if (!data) return null;
  try {
    return decrypt(data.encrypted_key as string);
  } catch {
    return null;
  }
}

export async function getComposioKeyHint(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('agent_api_keys')
    .select('key_hint')
    .eq('user_id', userId)
    .eq('provider', PROVIDER)
    .maybeSingle();
  return (data?.key_hint as string) ?? null;
}

export async function saveComposioKey(
  supabase: SupabaseClient,
  userId: string,
  key: string
): Promise<void> {
  await supabase.from('agent_api_keys').upsert(
    {
      user_id: userId,
      provider: PROVIDER,
      encrypted_key: encrypt(key),
      key_hint: key.slice(-4),
      created_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,provider' }
  );
}

export async function deleteComposioKey(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  await supabase
    .from('agent_api_keys')
    .delete()
    .eq('user_id', userId)
    .eq('provider', PROVIDER);
}

export async function listComposioConnections(
  supabase: SupabaseClient,
  userId: string
): Promise<ComposioConnectionRow[]> {
  const { data } = await supabase
    .from('agent_composio_connections')
    .select('id, toolkit, connected_account_id, account_label, autonomy, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  return (data ?? []) as ComposioConnectionRow[];
}

export async function upsertComposioConnection(
  supabase: SupabaseClient,
  userId: string,
  toolkit: string,
  connectedAccountId: string,
  accountLabel: string | null
): Promise<void> {
  await supabase.from('agent_composio_connections').upsert(
    {
      user_id: userId,
      toolkit,
      connected_account_id: connectedAccountId,
      account_label: accountLabel,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,toolkit' }
  );
}
