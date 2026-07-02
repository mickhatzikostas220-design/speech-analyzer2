// Keynote Tailoring — generate an industry-specific version of a master keynote.
// POST /api/keynotes/:id/tailor  { industry, audience? }  (Core Premium)
//
// Re-frames the master description for the given industry with GPT-4o (same tone
// and core idea, only the framing/examples change — see lib/keynotes/prompt.ts),
// saves it as a variant "branch" under the keynote, and returns it.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requirePlan } from '@/lib/subscription/requirePlan';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { createChatCompletion, hasAiKey } from '@/lib/ai-config';
import { buildTailorPrompt } from '@/lib/keynotes/prompt';
import { cleanIndustry } from '@/lib/keynotes/industries';
import type { Keynote } from '@/lib/keynotes/types';

export const maxDuration = 60;

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const gate = await requirePlan(supabase, 'core');
  if (gate) return gate;

  const limit = rateLimit(`keynote-tailor:${clientIp(request)}`, 20, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a few minutes.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
    );
  }

  if (!hasAiKey()) {
    return NextResponse.json({ error: 'The tailoring tool is not configured yet.' }, { status: 503 });
  }

  let body: { industry?: unknown; audience?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const industry = cleanIndustry(body.industry);
  const audience = cleanIndustry(body.audience, 120);
  if (!industry) {
    return NextResponse.json({ error: 'Tell us which industry to tailor this to.' }, { status: 400 });
  }

  // RLS ensures the keynote belongs to the signed-in user.
  const { data: keynote, error: loadErr } = await supabase
    .from('keynotes')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!keynote) return NextResponse.json({ error: 'Keynote not found.' }, { status: 404 });

  const k = keynote as Keynote;
  const prompt = buildTailorPrompt({
    title: k.title,
    description: k.description,
    industry,
    audience: audience || undefined,
  });

  let tailored = '';
  let changes: string[] = [];
  try {
    const completion = await createChatCompletion('gpt-4o', {
      max_tokens: 2000,
      temperature: 0.6,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    });
    const raw = completion.choices[0]?.message?.content ?? '';
    const parsed = JSON.parse(raw) as { tailored?: string; changes?: unknown };
    tailored = typeof parsed.tailored === 'string' ? parsed.tailored.trim() : '';
    changes = Array.isArray(parsed.changes)
      ? parsed.changes.filter((c): c is string => typeof c === 'string').slice(0, 4)
      : [];
  } catch (err) {
    console.error('Keynote tailoring failed:', err);
    return NextResponse.json(
      { error: 'Could not tailor that right now. Please try again.' },
      { status: 502 }
    );
  }

  if (!tailored) {
    return NextResponse.json({ error: 'The tailored version came back empty. Please try again.' }, { status: 502 });
  }

  const { data: variant, error: insertErr } = await supabase
    .from('keynote_variants')
    .insert({
      keynote_id: k.id,
      user_id: user.id,
      industry,
      audience: audience || null,
      tailored_description: tailored,
    })
    .select()
    .single();

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
  return NextResponse.json({ variant, changes });
}
