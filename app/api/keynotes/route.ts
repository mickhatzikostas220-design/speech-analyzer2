// Keynote Tailoring — list and create master keynotes.
// GET  /api/keynotes         → the signed-in user's keynotes, each with a variant count.
// POST /api/keynotes         → create a new master keynote (Core Premium).
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requirePlan } from '@/lib/subscription/requirePlan';
import type { Keynote, KeynoteSource } from '@/lib/keynotes/types';

const SOURCES: KeynoteSource[] = ['paste', 'pdf', 'docx', 'txt'];

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const { data: keynotes, error } = await supabase
    .from('keynotes')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Count variants per keynote in a second query (RLS scopes both to this user)
  // rather than relying on an embedded aggregate — simpler and more portable.
  const { data: variants } = await supabase.from('keynote_variants').select('keynote_id');
  const counts = new Map<string, number>();
  for (const v of (variants as { keynote_id: string }[]) ?? []) {
    counts.set(v.keynote_id, (counts.get(v.keynote_id) ?? 0) + 1);
  }

  const withCounts = ((keynotes as Keynote[]) ?? []).map((k) => ({
    ...k,
    variant_count: counts.get(k.id) ?? 0,
  }));
  return NextResponse.json(withCounts);
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const gate = await requirePlan(supabase, 'core');
  if (gate) return gate;

  let body: { title?: unknown; description?: unknown; source?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : '';
  const description = typeof body.description === 'string' ? body.description.trim().slice(0, 20000) : '';
  const source: KeynoteSource =
    typeof body.source === 'string' && SOURCES.includes(body.source as KeynoteSource)
      ? (body.source as KeynoteSource)
      : 'paste';

  if (!title) return NextResponse.json({ error: 'Give your keynote a title.' }, { status: 400 });
  if (description.length < 40) {
    return NextResponse.json(
      { error: 'Add a fuller keynote description (at least a few sentences) so there’s something to tailor.' },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from('keynotes')
    .insert({ user_id: user.id, title, description, source })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
