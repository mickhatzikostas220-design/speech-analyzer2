import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { exchangeCodeForTokens } from '@/lib/clipflow/platforms';
import { resolveOAuthCreds } from '@/lib/clipflow/secrets';
import { encryptToken } from '@/lib/clipflow/crypto';
import { PLATFORMS, type Platform } from '@/lib/clipflow/types';

export const dynamic = 'force-dynamic';

// OAuth redirect target. Exchanges the code for tokens, encrypts them, and
// stores the connection. Tokens are never sent to the browser.
export async function GET(request: NextRequest, { params }: { params: { platform: string } }) {
  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || request.nextUrl.origin;
  const back = (qs: string) => NextResponse.redirect(`${origin}/settings/connections?${qs}`);

  const platform = params.platform as Platform;
  if (!PLATFORMS.includes(platform)) return back('connect=error&msg=Unknown%20platform');

  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const oauthError = request.nextUrl.searchParams.get('error');

  if (oauthError) {
    return back(`connect=error&platform=${platform}&msg=${encodeURIComponent(oauthError)}`);
  }

  // CSRF check.
  const cookieState = request.cookies.get('clipflow_oauth_state')?.value;
  if (!state || !cookieState || state !== cookieState) {
    return back(`connect=error&platform=${platform}&msg=Invalid%20state`);
  }
  if (!code) return back(`connect=error&platform=${platform}&msg=Missing%20code`);

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  try {
    const creds = await resolveOAuthCreds(supabase, user.id, platform);
    const tokens = await exchangeCodeForTokens(platform, code, creds);

    const { error } = await supabase.from('clipflow_connections').upsert(
      {
        user_id: user.id,
        platform,
        account_name: tokens.accountName,
        account_id: tokens.accountId,
        scopes: tokens.scopes,
        encrypted_access_token: encryptToken(tokens.accessToken),
        encrypted_refresh_token: tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
        token_expires_at: tokens.expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,platform' }
    );

    if (error) {
      return back(`connect=error&platform=${platform}&msg=${encodeURIComponent(error.message)}`);
    }

    const res = back(`connect=success&platform=${platform}`);
    res.cookies.delete('clipflow_oauth_state');
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'OAuth failed';
    return back(`connect=error&platform=${platform}&msg=${encodeURIComponent(msg)}`);
  }
}
