import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  // Require a signed-in user: this route calls a paid OpenAI model, so leaving
  // it open lets anyone burn the API budget (financial DoS).
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const { labelA, labelB, avgs, choices } = body as {
    labelA?: unknown; labelB?: unknown; avgs?: unknown; choices?: Record<string, unknown>;
  };

  if (!Array.isArray(avgs) || !choices || typeof choices !== 'object') {
    return NextResponse.json({ error: 'Missing comparison data.' }, { status: 422 });
  }

  const safeLabel = (v: unknown, fallback: string) =>
    typeof v === 'string' && v.trim() ? v.trim().slice(0, 120) : fallback;
  const labelAStr = safeLabel(labelA, 'Speech A');
  const labelBStr = safeLabel(labelB, 'Speech B');

  const rows = (avgs as Array<{ key?: unknown; a?: unknown; b?: unknown; diff?: unknown }>)
    .slice(0, 30)
    .map((m) => {
      const key = typeof m.key === 'string' ? m.key.slice(0, 40) : 'metric';
      const a = Number(m.a) || 0;
      const b = Number(m.b) || 0;
      const diff = Number(m.diff) || 0;
      return `  ${key}: ${labelAStr}=${a}, ${labelBStr}=${b}, difference=${diff > 0 ? '+' : ''}${diff}`;
    })
    .join('\n');

  const labelA2 = labelAStr;
  const labelB2 = labelBStr;
  const sections = (Array.isArray(choices.include) ? (choices.include as unknown[]) : [])
    .filter((s): s is string => typeof s === 'string')
    .slice(0, 12)
    .join(', ');
  const tone = typeof choices.tone === 'string' ? choices.tone.slice(0, 40) : 'professional';
  const audience = typeof choices.audience === 'string' ? choices.audience.slice(0, 60) : 'the speaker';
  const length = typeof choices.length === 'string' ? choices.length.slice(0, 40) : 'medium';

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

Speech A: "${labelA2}"
Speech B: "${labelB2}"

Neural scores (0–100):
${rows}

Remember: for DMN, lower scores are better (less mind-wandering). For all others, higher is better.

Write the report now.`;

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
