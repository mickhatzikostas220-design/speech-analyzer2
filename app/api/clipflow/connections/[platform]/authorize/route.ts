import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { getAuthorizeUrl, platformUsesPkce, createPkcePair, PlatformError } from '@/lib/clipflow/platforms';
import { resolveOAuthCreds } from '@/lib/clipflow/secrets';
import { PLATFORMS, type Platform } from '@/lib/clipflow/types';

export const dynamic = 'force-dynamic';

// Kicks off the OAuth flow: validates the user, then redirects to the platform's
// consent screen with a CSRF state cookie.
export async function GET(request: NextRequest, { params }: { params: { platform: string } }) {
  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || request.nextUrl.origin;
  const back = (qs: string) => NextResponse.redirect(`${origin}/settings/connections?${qs}`);

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  const platform = params.platform as Platform;
  if (!PLATFORMS.includes(platform)) {
    return back('connect=error&msg=Unknown%20platform');
  }

  try {
    const state = randomUUID();
    const pkce = platformUsesPkce(platform) ? createPkcePair() : null;
    const creds = await resolveOAuthCreds(supabase, user.id, platform);
    const url = getAuthorizeUrl(platform, state, creds, pkce?.challenge);
    const res = NextResponse.redirect(url);
    const cookieOpts = {
      httpOnly: true,
      secure: true,
      sameSite: 'lax' as const,
      maxAge: 600,
      path: '/',
    };
    res.cookies.set('clipflow_oauth_state', state, cookieOpts);
    // The PKCE verifier stays server-side (httpOnly) for the round trip; the
    // callback reads it back to complete the token exchange.
    if (pkce) res.cookies.set('clipflow_oauth_verifier', pkce.verifier, cookieOpts);
    return res;
  } catch (err) {
    const msg = err instanceof PlatformError ? err.message : 'Could not start OAuth';
    return back(`connect=error&platform=${platform}&msg=${encodeURIComponent(msg)}`);
  }
}
