// User's scheduled coaching tips. Listing is open to any signed-in user;
// scheduling is a paid feature (Core/Full).
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserPlan } from '@/lib/subscription/server';
import { tipById } from '@/lib/tips/library';

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const { data, error } = await supabase
    .from('user_tips')
    .select('*')
    .order('completed', { ascending: true })
    .order('scheduled_for', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const plan = await getUserPlan(supabase);
  if (plan === 'free') {
    return NextResponse.json(
      { error: 'Scheduling tips is a premium feature. Upgrade to plan and track tips.' },
      { status: 403 }
    );
  }

  let body: { tip_id?: unknown; scheduled_for?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const tipId = typeof body.tip_id === 'string' ? body.tip_id : '';
  if (!tipById(tipId)) {
    return NextResponse.json({ error: 'Unknown tip.' }, { status: 400 });
  }
  const scheduledFor =
    typeof body.scheduled_for === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.scheduled_for)
      ? body.scheduled_for
      : null;

  const { data, error } = await supabase
    .from('user_tips')
    .insert({ user_id: user.id, tip_id: tipId, scheduled_for: scheduledFor })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
