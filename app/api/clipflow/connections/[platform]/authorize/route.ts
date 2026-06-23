import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { getAuthorizeUrl, PlatformError } from '@/lib/clipflow/platforms';
import { resolveOAuthCreds } from '@/lib/clipflow/secrets';
import { PLATFORMS, type Platform } from '@/lib/clipflow/types';

export const dynamic = 'force-dynamic';

// Kicks off the OAuth flow: validates the user, then redirects to the platform's
// consent screen with a CSRF state cookie.
export async function GET(request: NextRequest, { params }: { params: { platform: string } }) {
  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || request.nextUrl.origin;
  const back = (qs: string) => NextResponse.redirect(`${origin}/clipflow?${qs}`);

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  const platform = params.platform as Platform;
  if (!PLATFORMS.includes(platform)) {
    return back('connect=error&msg=Unknown%20platform');
  }

  try {
    const state = randomUUID();
    const creds = await resolveOAuthCreds(supabase, user.id, platform);
    const url = getAuthorizeUrl(platform, state, creds);
    const res = NextResponse.redirect(url);
    res.cookies.set('clipflow_oauth_state', state, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 600,
      path: '/',
    });
    return res;
  } catch (err) {
    const msg = err instanceof PlatformError ? err.message : 'Could not start OAuth';
    return back(`connect=error&platform=${platform}&msg=${encodeURIComponent(msg)}`);
  }
}
