// Keynote Tailoring — read, edit, or delete a single master keynote.
// GET    /api/keynotes/:id   → the keynote plus its industry-tailored variants.
// PATCH  /api/keynotes/:id   → edit the master title/description (Core Premium).
// DELETE /api/keynotes/:id   → delete the keynote (its variants cascade away).
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requirePlan } from '@/lib/subscription/requirePlan';
import type { KeynoteVariant } from '@/lib/keynotes/types';

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  // RLS already limits these to the signed-in user's rows; the explicit
  // user_id filter is belt-and-suspenders so authorization never hinges on
  // RLS alone (matches every other /api/*/[id] route in this codebase).
  const { data: keynote, error } = await supabase
    .from('keynotes')
    .select('*')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!keynote) return NextResponse.json({ error: 'Keynote not found.' }, { status: 404 });

  const { data: variants } = await supabase
    .from('keynote_variants')
    .select('*')
    .eq('keynote_id', params.id)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  return NextResponse.json({ keynote, variants: (variants as KeynoteVariant[]) ?? [] });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const gate = await requirePlan(supabase, 'core');
  if (gate) return gate;

  let body: { title?: unknown; description?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const update: { title?: string; description?: string; updated_at: string } = {
    updated_at: new Date().toISOString(),
  };
  if (typeof body.title === 'string') {
    const title = body.title.trim().slice(0, 200);
    if (!title) return NextResponse.json({ error: 'Title can’t be empty.' }, { status: 400 });
    update.title = title;
  }
  if (typeof body.description === 'string') {
    const description = body.description.trim().slice(0, 20000);
    if (description.length < 40) {
      return NextResponse.json({ error: 'Description is too short to tailor.' }, { status: 400 });
    }
    update.description = description;
  }

  const { data, error } = await supabase
    .from('keynotes')
    .update(update)
    .eq('id', params.id)
    .eq('user_id', user.id)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Keynote not found.' }, { status: 404 });
  return NextResponse.json(data);
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const { error } = await supabase
    .from('keynotes')
    .delete()
    .eq('id', params.id)
    .eq('user_id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
