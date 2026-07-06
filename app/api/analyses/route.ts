import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('analyses')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Abuse guard: no human uploads 10 talks a minute. Burst protection that
  // shields the expensive downstream GPU work (transcription + TRIBE v2). The
  // Speech Analyzer is free and unlimited, so this rapid-fire guard is the only
  // cap on creating analyses.
  const rl = rateLimit(`analyses:create:${user.id}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'You are creating analyses too quickly — please wait a moment and try again.', code: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
    );
  }

  const body = await request.json();
  const { title, file_path, file_type, duration_seconds } = body;

  if (!title || !file_path || !file_type) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // The Speech Analyzer is free and unlimited for every signed-in speaker, so
  // there is no per-plan quota to enforce here. The burst rate-limit above is
  // the only cap on how fast analyses can be created.

  const { data, error } = await supabase
    .from('analyses')
    .insert({ user_id: user.id, title, file_path, file_type, duration_seconds, status: 'pending' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
