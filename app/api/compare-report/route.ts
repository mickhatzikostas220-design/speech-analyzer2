import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';

// Instantiated lazily inside the handler — building the client at module load
// throws when OPENAI_API_KEY is absent (e.g. during build/page-data collection).
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  // Require a signed-in user — middleware does not cover /api, and this route
  // spends OpenAI tokens, so an open endpoint is a cost/abuse vector.
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { labelA, labelB, avgs, choices } = body;

  if (!Array.isArray(avgs) || !choices || typeof choices !== 'object') {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const rows = avgs.map((m: { key: string; a: number; b: number; diff: number }) =>
    `  ${m.key}: ${labelA}=${m.a}, ${labelB}=${m.b}, difference=${m.diff > 0 ? '+' : ''}${m.diff}`
  ).join('\n');

  const sections = (choices.include as string[]).join(', ');
  const tone = choices.tone as string;
  const audience = choices.audience as string;
  const length = choices.length as string;

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

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OPENAI_API_KEY not configured.' }, { status: 500 });
  }
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
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
