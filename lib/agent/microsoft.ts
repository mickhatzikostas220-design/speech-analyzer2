import type { SupabaseClient } from '@supabase/supabase-js';
import { decrypt, encrypt } from '@/lib/crypto';

// Microsoft Graph OAuth for Outlook Mail + Calendar.
// Needs MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET in env.

export const MICROSOFT_SCOPES = [
  'openid',
  'email',
  'offline_access',
  'User.Read',
  'Mail.ReadWrite',
  'Mail.Send',
  'Calendars.ReadWrite',
];

export function microsoftConfigured(): boolean {
  return !!process.env.MICROSOFT_CLIENT_ID && !!process.env.MICROSOFT_CLIENT_SECRET;
}

export function msRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3002';
  return `${base.replace(/\/$/, '')}/api/agent/connect/microsoft/callback`;
}

export function buildMsAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    redirect_uri: msRedirectUri(),
    response_type: 'code',
    scope: MICROSOFT_SCOPES.join(' '),
    response_mode: 'query',
    state,
  });
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
}

interface MsTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

export async function msExchangeCode(code: string): Promise<MsTokenResponse> {
  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      redirect_uri: msRedirectUri(),
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) throw new Error(`Microsoft token exchange failed: ${await res.text()}`);
  return res.json();
}

export async function msFetchUserEmail(accessToken: string): Promise<string | null> {
  const res = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { mail?: string; userPrincipalName?: string };
  return data.mail ?? data.userPrincipalName ?? null;
}

async function msRefreshAccessToken(refreshToken: string): Promise<MsTokenResponse> {
  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`Microsoft token refresh failed: ${await res.text()}`);
  return res.json();
}

export async function getMsAccessToken(
  supabase: SupabaseClient,
  connectionId: string
): Promise<string> {
  const { data } = await supabase
    .from('agent_connections')
    .select('encrypted_access_token, encrypted_refresh_token, token_expires_at')
    .eq('id', connectionId)
    .single();
  if (!data) throw new Error('Microsoft connection not found');

  const expiresAt = data.token_expires_at ? new Date(data.token_expires_at).getTime() : 0;
  if (expiresAt - Date.now() > 60_000 && data.encrypted_access_token) {
    return decrypt(data.encrypted_access_token);
  }

  if (!data.encrypted_refresh_token) {
    if (data.encrypted_access_token) return decrypt(data.encrypted_access_token);
    throw new Error('Microsoft connection has no usable token — reconnect the account.');
  }

  const refreshed = await msRefreshAccessToken(decrypt(data.encrypted_refresh_token));
  const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await supabase
    .from('agent_connections')
    .update({
      encrypted_access_token: encrypt(refreshed.access_token),
      token_expires_at: newExpiry,
      updated_at: new Date().toISOString(),
    })
    .eq('id', connectionId);
  return refreshed.access_token;
}
