import { NextRequest, NextResponse } from 'next/server';
import { getUserAndAdmin } from '@/lib/agent/server';
import { msExchangeCode, msFetchUserEmail } from '@/lib/agent/microsoft';
import { encrypt } from '@/lib/crypto';

export const runtime = 'nodejs';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3002';

export async function GET(request: NextRequest) {
  const auth = await getUserAndAdmin();
  if (!auth) return NextResponse.redirect(`${APP_URL}/login`);

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieState = request.cookies.get('agent_ms_oauth_state')?.value;

  if (url.searchParams.get('error')) {
    return NextResponse.redirect(`${APP_URL}/agent/settings?tab=apps&error=microsoft_denied`);
  }
  if (!code || !state || !cookieState || state !== cookieState) {
    return NextResponse.redirect(`${APP_URL}/agent/settings?tab=apps&error=microsoft_state`);
  }

  try {
    const tokens = await msExchangeCode(code);
    const email = await msFetchUserEmail(tokens.access_token);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const row: Record<string, unknown> = {
      user_id: auth.user.id,
      provider: 'microsoft',
      account_email: email,
      scopes: tokens.scope ?? null,
      encrypted_access_token: encrypt(tokens.access_token),
      token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    };
    if (tokens.refresh_token) row.encrypted_refresh_token = encrypt(tokens.refresh_token);

    await auth.admin
      .from('agent_connections')
      .upsert(row, { onConflict: 'user_id,provider,account_email' });

    const response = NextResponse.redirect(
      `${APP_URL}/agent/settings?tab=apps&connected=microsoft`
    );
    response.cookies.delete('agent_ms_oauth_state');
    return response;
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return NextResponse.redirect(
      `${APP_URL}/agent/settings?tab=apps&error=${encodeURIComponent(`microsoft_exchange:${msg}`.slice(0, 120))}`
    );
  }
}
