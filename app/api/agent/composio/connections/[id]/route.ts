import { NextRequest, NextResponse } from 'next/server';
import { getUserAndAdmin } from '@/lib/agent/server';
import { getComposioKey } from '@/lib/composio/store';
import { disconnectAccount } from '@/lib/composio/client';

export const runtime = 'nodejs';

const AUTONOMY = ['read_only', 'draft_confirm', 'act_directly'];

// Change how much the agent may do with a connected Composio app.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getUserAndAdmin();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  if (!AUTONOMY.includes(body.autonomy)) {
    return NextResponse.json({ error: 'Invalid autonomy' }, { status: 400 });
  }

  const { error } = await auth.admin
    .from('agent_composio_connections')
    .update({ autonomy: body.autonomy, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('user_id', auth.user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Disconnect an app: revoke it in Composio (best-effort) and drop our row.
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getUserAndAdmin();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: row } = await auth.admin
    .from('agent_composio_connections')
    .select('connected_account_id')
    .eq('id', params.id)
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (row?.connected_account_id) {
    try {
      const key = await getComposioKey(auth.admin, auth.user.id);
      if (key) await disconnectAccount(key, row.connected_account_id as string);
    } catch {
      // Revoke is best-effort; we still remove our pointer below.
    }
  }

  const { error } = await auth.admin
    .from('agent_composio_connections')
    .delete()
    .eq('id', params.id)
    .eq('user_id', auth.user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
