import { NextRequest, NextResponse } from 'next/server';
import { getUserAndAdmin } from '@/lib/agent/server';

export const runtime = 'nodejs';

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getUserAndAdmin();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: convo } = await auth.admin
    .from('agent_conversations')
    .select('id, title')
    .eq('id', params.id)
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (!convo) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: messages } = await auth.admin
    .from('agent_messages')
    .select('id, role, content, created_at')
    .eq('conversation_id', params.id)
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: true });

  return NextResponse.json({ conversation: convo, messages: messages ?? [] });
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getUserAndAdmin();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await auth.admin
    .from('agent_conversations')
    .delete()
    .eq('id', params.id)
    .eq('user_id', auth.user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
