/*
  Run this SQL in your Supabase SQL editor before using this feature:

  create table if not exists script_projects (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references profiles(id) on delete cascade not null,
    title text not null,
    script text default '',
    status text not null default 'empty',
    clips jsonb not null default '[]',
    segments jsonb not null default '[]',
    created_at timestamptz default now()
  );
  alter table script_projects enable row level security;
  create policy "Users manage own script projects" on script_projects
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
*/

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr) return NextResponse.json({ error: `Auth: ${authErr.message}` }, { status: 401 });
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supabase
      .from('script_projects')
      .select('id, title, status, clips, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: `DB: ${error.message}` }, { status: 500 });
    return NextResponse.json(data ?? []);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Unexpected: ${msg}` }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr) return NextResponse.json({ error: `Auth: ${authErr.message}` }, { status: 401 });
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let title: string | undefined;
    try {
      const text = (await request.text()).trim();
      title = text ? JSON.parse(text).title : undefined;
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 });

    const id = randomUUID();
    const now = new Date().toISOString();

    const { error } = await supabase
      .from('script_projects')
      .insert({
        id,
        user_id: user.id,
        title,
        status: 'empty',
        clips: [],
        segments: [],
        script: '',
      });

    if (error) return NextResponse.json({ error: `DB: ${error.message}` }, { status: 500 });

    return NextResponse.json(
      { id, user_id: user.id, title, status: 'empty', clips: [], segments: [], script: '', created_at: now },
      { status: 201 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Unexpected: ${msg}` }, { status: 500 });
  }
}
