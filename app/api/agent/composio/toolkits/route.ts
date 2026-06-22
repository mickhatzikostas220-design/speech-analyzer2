import { NextRequest, NextResponse } from 'next/server';
import { getUserAndAdmin } from '@/lib/agent/server';
import { getComposioKey } from '@/lib/composio/store';
import { listConnectableToolkits } from '@/lib/composio/client';

export const runtime = 'nodejs';

// Lists toolkits the user can connect — a featured set by default, or catalog
// search results when `?q=` is provided. Requires the user's Composio key.
export async function GET(request: NextRequest) {
  const auth = await getUserAndAdmin();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const key = await getComposioKey(auth.admin, auth.user.id);
  if (!key) return NextResponse.json({ error: 'No Composio key set' }, { status: 400 });

  const q = new URL(request.url).searchParams.get('q')?.trim() || undefined;
  try {
    const toolkits = await listConnectableToolkits(key, q);
    return NextResponse.json({ toolkits });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
