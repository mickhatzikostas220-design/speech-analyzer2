import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createChatCompletion } from '@/lib/ai-config';

// Created lazily inside the handler — instantiating at module scope throws
// when OPENAI_API_KEY is missing during `next build`, which breaks the build.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  // This endpoint spends OpenAI credits, so it must be signed-in-only.
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const str = (v: unknown, max = 120) =>
    typeof v === 'string' ? v.slice(0, max) : '';
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

  const labelA = str(body.labelA) || 'Speech A';
  const labelB = str(body.labelB) || 'Speech B';
  const avgs = Array.isArray(body.avgs) ? body.avgs.slice(0, 20) : null;
  const choices =
    body.choices && typeof body.choices === 'object'
      ? (body.choices as Record<string, unknown>)
      : null;

  if (!avgs || !choices) {
    return NextResponse.json({ error: 'Missing comparison data.' }, { status: 400 });
  }

  const rows = avgs
    .map((m: unknown) => {
      const row = (m ?? {}) as Record<string, unknown>;
      const diff = num(row.diff);
      return `  ${str(row.key, 40)}: ${labelA}=${num(row.a)}, ${labelB}=${num(row.b)}, difference=${diff > 0 ? '+' : ''}${diff}`;
    })
    .join('\n');

  const sections = (Array.isArray(choices.include) ? choices.include : [])
    .map((s: unknown) => str(s, 40))
    .filter(Boolean)
    .join(', ');
  const tone = str(choices.tone, 40) || 'professional';
  const audience = str(choices.audience, 60) || 'the speaker';
  const length = str(choices.length, 40) || 'medium';

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

Include these sections: ${sections || 'summary, key differences, recommendations'}.`;

  const userPrompt = `Compare these two speeches using their neural engagement data:

Speech A: "${labelA}"
Speech B: "${labelB}"

Neural scores (0–100):
${rows}

Remember: for DMN, lower scores are better (less mind-wandering). For all others, higher is better.

Write the report now.`;

  const response = await createChatCompletion('gpt-4o', {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: 1500,
    temperature: 0.7,
  });

  const report = response.choices[0]?.message?.content ?? 'Report generation failed.';
  return NextResponse.json({ report });
}
