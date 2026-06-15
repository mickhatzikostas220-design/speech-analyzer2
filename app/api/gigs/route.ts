import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUpcomingGigs } from '@/lib/gigs/server';
import type { GigStatus } from '@/lib/gigs/types';

export const runtime = 'nodejs';

const STATUSES: GigStatus[] = ['confirmed', 'hold', 'tentative', 'ticketed'];

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const result = await getUpcomingGigs(supabase, user.id);
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
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

  const title = String(body.title ?? '').trim();
  const startsRaw = String(body.starts_at ?? '').trim();
  if (!title) return NextResponse.json({ error: 'Give your gig a title.' }, { status: 422 });

  const startsDate = new Date(startsRaw);
  if (isNaN(startsDate.getTime())) {
    return NextResponse.json({ error: 'Pick a valid date.' }, { status: 422 });
  }

  const status = STATUSES.includes(body.status as GigStatus)
    ? (body.status as GigStatus)
    : 'confirmed';

  const { data, error } = await supabase
    .from('gigs')
    .insert({
      user_id: user.id,
      title,
      location: body.location ? String(body.location).trim() : null,
      kind: body.kind ? String(body.kind).trim() : null,
      status,
      starts_at: startsDate.toISOString(),
      source: 'manual',
    })
    .select()
    .single();

  if (error) {
    console.error('[gigs] insert failed', error);
    return NextResponse.json(
      { error: 'Could not save the gig. Make sure the gigs migration has run.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ gig: data });
}
