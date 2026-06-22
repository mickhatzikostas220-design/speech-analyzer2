import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { Track } from '@/lib/aeo/types';

export const runtime = 'nodejs';

const TRACKS: Track[] = ['wix', 'other', 'code'];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};

  if (typeof body.completed === 'boolean') {
    patch.status = body.completed ? 'completed' : 'active';
    patch.completed_at = body.completed ? new Date().toISOString() : null;
  }
  if (body.status === 'skipped') {
    patch.status = 'skipped';
  }
  if (body.track === null) {
    patch.track = null;
  } else if (typeof body.track === 'string' && TRACKS.includes(body.track as Track)) {
    patch.track = body.track;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 422 });
  }

  const { data, error } = await supabase
    .from('aeo_tips')
    .update(patch)
    .eq('id', params.id)
    .eq('user_id', user.id)
    .select('id, tip_key, status, track, released_at, completed_at')
    .single();

  if (error) {
    return NextResponse.json({ error: 'Could not update the tip.' }, { status: 500 });
  }

  return NextResponse.json({ tip: data });
}
