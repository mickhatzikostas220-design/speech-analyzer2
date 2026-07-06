// Collect early-speaker feedback — criticism and feature requests gathered
// during the free beta. Signed-in only; writes one row per submission to the
// feedback table (RLS ties each row to its author). The team reviews it via the
// service-role key.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/rateLimit';

const CATEGORIES = ['feature', 'criticism', 'bug', 'other'] as const;
type Category = (typeof CATEGORIES)[number];

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  // Anti-spam: a handful of notes a minute is plenty for a real person.
  const rl = rateLimit(`feedback:${user.id}`, 6, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'You’re sending feedback too quickly — please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
    );
  }

  let body: { category?: unknown; message?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) {
    return NextResponse.json({ error: 'Please write a message first.' }, { status: 400 });
  }
  if (message.length > 4000) {
    return NextResponse.json(
      { error: 'That’s a bit long — please keep it under 4000 characters.' },
      { status: 400 }
    );
  }

  const category: Category = CATEGORIES.includes(body.category as Category)
    ? (body.category as Category)
    : 'other';

  const { error } = await supabase.from('feedback').insert({
    user_id: user.id,
    email: user.email ?? null,
    category,
    message,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true }, { status: 201 });
}
