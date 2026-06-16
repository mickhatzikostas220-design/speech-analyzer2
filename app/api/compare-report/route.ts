import { NextRequest, NextResponse } from 'next/server';
import { getOpenAI } from '@/lib/openai';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  // This route calls GPT-4o (a paid model), so require an authenticated user
  // to prevent anonymous abuse of the endpoint.
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { labelA, labelB, avgs, choices } = body ?? {};

  if (!Array.isArray(avgs) || avgs.length === 0 || !choices || typeof choices !== 'object') {
    return NextResponse.json({ error: 'Missing or invalid report data' }, { status: 400 });
  }

  const rows = avgs.map((m: { key: string; a: number; b: number; diff: number }) =>
    `  ${m.key}: ${labelA}=${m.a}, ${labelB}=${m.b}, difference=${m.diff > 0 ? '+' : ''}${m.diff}`
  ).join('\n');

  const sections = (Array.isArray(choices.include) ? choices.include : []).join(', ');
  const tone = (choices.tone as string) ?? 'professional';
  const audience = (choices.audience as string) ?? 'the speaker';
  const length = (choices.length as string) ?? 'medium';

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

  const response = await getOpenAI().chat.completions.create({
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
