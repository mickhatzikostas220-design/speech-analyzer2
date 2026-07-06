import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createChatCompletion } from '@/lib/ai-config';
import { getMemoryContext } from '@/lib/memory/store';

// Created lazily inside the handler — instantiating at module scope throws
// when OPENAI_API_KEY is missing during `next build`, which breaks the build.
export const maxDuration = 60;

// Clamp a user-supplied string so prompt inputs stay bounded.
const capStr = (v: unknown, max: number, fallback: string) =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : fallback;

export async function POST(request: NextRequest) {
  // SECURITY: this route spends OpenAI tokens — require a signed-in user so it
  // can't be used as a free, anonymous GPT-4o proxy.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const labelA = capStr(body.labelA, 200, 'Speech A');
  const labelB = capStr(body.labelB, 200, 'Speech B');
  const avgsRaw = Array.isArray(body.avgs) ? body.avgs.slice(0, 24) : [];
  const choices = (body.choices ?? {}) as Record<string, unknown>;

  const rows = avgsRaw
    .filter(
      (m): m is { key: string; a: number; b: number; diff: number } =>
        !!m &&
        typeof (m as { key?: unknown }).key === 'string' &&
        typeof (m as { a?: unknown }).a === 'number' &&
        typeof (m as { b?: unknown }).b === 'number' &&
        typeof (m as { diff?: unknown }).diff === 'number'
    )
    .map(
      (m) =>
        `  ${m.key.slice(0, 60)}: ${labelA}=${m.a}, ${labelB}=${m.b}, difference=${m.diff > 0 ? '+' : ''}${m.diff}`
    )
    .join('\n');

  if (!rows) {
    return NextResponse.json({ error: 'No comparison data provided.' }, { status: 400 });
  }

  const sections = (Array.isArray(choices.include) ? choices.include : [])
    .filter((s): s is string => typeof s === 'string')
    .map((s) => s.slice(0, 60))
    .slice(0, 12)
    .join(', ') || 'summary, key differences, recommendations';
  const tone = capStr(choices.tone, 60, 'professional');
  const audience = capStr(choices.audience, 60, 'the speaker');
  const length = capStr(choices.length, 60, 'medium');

  const systemPrompt = `You are an expert speech coach writing a neural engagement analysis report.
You have access to Tribe v2 fMRI brain encoding model data that predicts how an audience's brain responds to speech.

Write in a ${tone} tone for ${audience}. Length: ${length}.

Key metric explanations (use these naturally, don't list them robotically):
- Engagement: overall brain attention (higher = better)
- Auditory: brain response to voice sound — vocal variety, clarity, tone
- Language: how easily the brain decodes the words — clarity and complexity
- Attention: sustained mental focus throughout the speech
- DMN (Default Mode Network): mind-wandering — LOWER is better here
- Prosody: rhythm, intonation, natural flow of speech
- Emotional: insula activation — emotional resonance and personal connection
- Memory: parahippocampal activation — how likely content is to be remembered

Include these sections: ${sections}.`;

  const userPrompt = `Compare these two speeches using their neural engagement data:

Speech A: "${labelA}"
Speech B: "${labelB}"

Neural scores (0–100):
${rows}

Remember: for DMN, lower scores are better (less mind-wandering). For all others, higher is better.

Write the report now.`;

  // Fold in what we remember about this speaker (goals, style, audience) so the
  // report is framed for them, not generic. Empty string when memory is off.
  const memoryContext = await getMemoryContext(supabase, user.id);

  const response = await createChatCompletion('gpt-4o', {
    messages: [
      { role: 'system', content: systemPrompt },
      ...(memoryContext ? [{ role: 'system' as const, content: memoryContext }] : []),
      { role: 'user', content: userPrompt },
    ],
    max_tokens: 1500,
    temperature: 0.7,
  });

  const report = response.choices[0]?.message?.content ?? 'Report generation failed.';
  return NextResponse.json({ report });
}
