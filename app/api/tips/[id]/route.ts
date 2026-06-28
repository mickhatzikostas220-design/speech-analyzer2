// Update (complete/uncomplete, reschedule) or delete a scheduled tip. RLS
// scopes every row to its owner; scheduling features are paid-only.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserPlan } from '@/lib/subscription/server';

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const plan = await getUserPlan(supabase);
  if (plan === 'free') {
    return NextResponse.json({ error: 'This is a premium feature.' }, { status: 403 });
  }

  let body: { completed?: unknown; scheduled_for?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.completed === 'boolean') {
    patch.completed = body.completed;
    patch.completed_at = body.completed ? new Date().toISOString() : null;
  }
  if (typeof body.scheduled_for === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.scheduled_for)) {
    patch.scheduled_for = body.scheduled_for;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('user_tips')
    .update(patch)
    .eq('id', params.id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const { error } = await supabase.from('user_tips').delete().eq('id', params.id).eq('user_id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
