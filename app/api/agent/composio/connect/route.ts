import { NextRequest, NextResponse } from 'next/server';
import { getUserAndAdmin } from '@/lib/agent/server';
import { getComposioKey } from '@/lib/composio/store';
import { initiateConnection } from '@/lib/composio/client';

export const runtime = 'nodejs';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3002';
const SETTINGS = `${APP_URL}/agent/settings`;

// Kicks off a Composio OAuth connection for a toolkit and redirects the user to
// Composio's hosted consent page. Composio sends them back to our callback,
// which records the active connection.
export async function GET(request: NextRequest) {
  const auth = await getUserAndAdmin();
  if (!auth) return NextResponse.redirect(`${APP_URL}/login`);

  const toolkit = new URL(request.url).searchParams.get('toolkit')?.trim().toLowerCase();
  if (!toolkit) return NextResponse.redirect(`${SETTINGS}?error=composio_missing_toolkit`);

  const key = await getComposioKey(auth.admin, auth.user.id);
  if (!key) return NextResponse.redirect(`${SETTINGS}?error=composio_no_key`);

  try {
    const callbackUrl = `${APP_URL}/api/agent/composio/callback`;
    const { redirectUrl } = await initiateConnection(key, auth.user.id, toolkit, callbackUrl);
    // OAuth toolkits return a hosted URL; non-OAuth (e.g. API-key) ones connect
    // immediately, so head straight to the callback to record them.
    return NextResponse.redirect(redirectUrl || callbackUrl);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return NextResponse.redirect(
      `${SETTINGS}?error=${encodeURIComponent(`composio_connect:${msg}`.slice(0, 120))}`
    );
  }
}
