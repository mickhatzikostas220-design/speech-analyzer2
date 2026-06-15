import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchIcsEvents, normalizeIcsUrl } from '@/lib/gigs/ics';

export const runtime = 'nodejs';
export const maxDuration = 20;

/**
 * PUT /api/gigs/calendar { url }  — connect a calendar feed (iCal/ICS URL).
 * We try to read it so we can tell the speaker how many events we found,
 * but we still save the URL even if the fetch is blocked in this env.
 */
export async function PUT(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  let url = '';
  try {
    url = String((await req.json())?.url ?? '').trim();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  if (!url) return NextResponse.json({ error: 'Paste your calendar link.' }, { status: 422 });

  const normalized = normalizeIcsUrl(url);
  if (!/^https?:\/\//i.test(normalized)) {
    return NextResponse.json(
      { error: 'That should be an iCal/ICS link (https:// or webcal://).' },
      { status: 422 }
    );
  }

  const events = await fetchIcsEvents(normalized);

  const { error } = await supabase
    .from('profiles')
    .update({ calendar_ics_url: normalized })
    .eq('id', user.id);
  if (error) {
    console.error('[gigs/calendar] save failed', error);
    return NextResponse.json(
      { error: 'Could not save the calendar. Make sure the gigs migration has run.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ calendarUrl: normalized, found: events.length });
}

/** DELETE — disconnect the calendar feed. */
export async function DELETE() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const { error } = await supabase
    .from('profiles')
    .update({ calendar_ics_url: null })
    .eq('id', user.id);
  if (error) return NextResponse.json({ error: 'Could not disconnect.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
