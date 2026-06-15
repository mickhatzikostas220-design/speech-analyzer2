import { NextResponse } from 'next/server';
import { getUserAndAdmin } from '@/lib/agent/server';

export const runtime = 'nodejs';

export async function GET() {
  const auth = await getUserAndAdmin();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await auth.admin
    .from('agent_conversations')
    .select('id, title, updated_at')
    .eq('user_id', auth.user.id)
    .order('updated_at', { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
