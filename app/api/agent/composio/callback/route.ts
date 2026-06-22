import { NextResponse } from 'next/server';
import { getUserAndAdmin } from '@/lib/agent/server';
import { getComposioKey, upsertComposioConnection } from '@/lib/composio/store';
import { listConnectedAccounts } from '@/lib/composio/client';

export const runtime = 'nodejs';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3002';
const SETTINGS = `${APP_URL}/agent/settings`;

// Composio redirects here after the user authorizes an app. We reconcile by
// listing the user's active connected accounts and upserting a row for each —
// idempotent, and it preserves the autonomy already granted to existing ones.
export async function GET() {
  const auth = await getUserAndAdmin();
  if (!auth) return NextResponse.redirect(`${APP_URL}/login`);

  const key = await getComposioKey(auth.admin, auth.user.id);
  if (!key) return NextResponse.redirect(`${SETTINGS}?error=composio_no_key`);

  try {
    const accounts = await listConnectedAccounts(key, auth.user.id);
    for (const a of accounts) {
      if (!a.toolkit) continue;
      await upsertComposioConnection(auth.admin, auth.user.id, a.toolkit, a.id, null);
    }
    return NextResponse.redirect(`${SETTINGS}?composio_connected=1`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return NextResponse.redirect(
      `${SETTINGS}?error=${encodeURIComponent(`composio_callback:${msg}`.slice(0, 120))}`
    );
  }
}
