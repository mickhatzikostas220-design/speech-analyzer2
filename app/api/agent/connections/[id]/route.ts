import { NextRequest, NextResponse } from 'next/server';
import { getUserAndAdmin } from '@/lib/agent/server';

export const runtime = 'nodejs';

const AUTONOMY = ['read_only', 'draft_confirm', 'act_directly'];

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getUserAndAdmin();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  if (!AUTONOMY.includes(body.autonomy)) {
    return NextResponse.json({ error: 'Invalid autonomy' }, { status: 400 });
  }

  const { error } = await auth.admin
    .from('agent_connections')
    .update({ autonomy: body.autonomy, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('user_id', auth.user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getUserAndAdmin();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await auth.admin
    .from('agent_connections')
    .delete()
    .eq('id', params.id)
    .eq('user_id', auth.user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
