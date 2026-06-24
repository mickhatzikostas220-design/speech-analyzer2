import type { SupabaseClient } from '@supabase/supabase-js';
import { decrypt, encrypt } from '@/lib/crypto';

// Google OAuth + token management for connected Gmail accounts.
// One Google OAuth app (client id/secret) unlocks Gmail today and Calendar /
// Drive later — they share the same consent flow.

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.send',
];

export function googleConfigured(): boolean {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
}

export function redirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3002';
  return `${base.replace(/\/$/, '')}/api/agent/connect/google/callback`;
}

export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${await res.text()}`);
  return res.json();
}

export async function fetchUserEmail(accessToken: string): Promise<string | null> {
  const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { email?: string };
  return data.email ?? null;
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`Google token refresh failed: ${await res.text()}`);
  return res.json();
}

// Returns a valid access token for a connection, refreshing + persisting if expired.
export async function getValidAccessToken(
  supabase: SupabaseClient,
  connectionId: string,
  userId: string
): Promise<string> {
  // Scope by user_id as well as id: tool execution uses the service-role
  // client (RLS-bypassing), so this is the only guard preventing one user's
  // tokens from being read via another connection id.
  const { data } = await supabase
    .from('agent_connections')
    .select('encrypted_access_token, encrypted_refresh_token, token_expires_at')
    .eq('id', connectionId)
    .eq('user_id', userId)
    .single();
  if (!data) throw new Error('Connection not found');

  const expiresAt = data.token_expires_at ? new Date(data.token_expires_at).getTime() : 0;
  const stillValid = expiresAt - Date.now() > 60_000;
  if (stillValid && data.encrypted_access_token) {
    return decrypt(data.encrypted_access_token);
  }

  if (!data.encrypted_refresh_token) {
    // No refresh token — fall back to the (possibly expired) access token.
    if (data.encrypted_access_token) return decrypt(data.encrypted_access_token);
    throw new Error('Google connection has no usable token — reconnect the account.');
  }

  const refreshed = await refreshAccessToken(decrypt(data.encrypted_refresh_token));
  const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await supabase
    .from('agent_connections')
    .update({
      encrypted_access_token: encrypt(refreshed.access_token),
      token_expires_at: newExpiry,
      updated_at: new Date().toISOString(),
    })
    .eq('id', connectionId)
    .eq('user_id', userId);
  return refreshed.access_token;
}
