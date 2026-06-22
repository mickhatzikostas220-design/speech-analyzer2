import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const maxDuration = 60;

// Bounded vocabularies so user input can't steer the prompt arbitrarily and so
// the values interpolated below are always known-safe strings.
const TONES = ['professional', 'encouraging', 'direct', 'analytical', 'casual'];
const AUDIENCES = ['the speaker', 'a coach', 'an executive team', 'a general audience'];
const LENGTHS = ['short', 'medium', 'long'];
const SECTIONS = ['summary', 'strengths', 'weaknesses', 'recommendations', 'metrics'];

const oneOf = (v: unknown, allowed: string[], fallback: string) =>
  typeof v === 'string' && allowed.includes(v) ? v : fallback;

export async function POST(request: NextRequest) {
  // This endpoint triggers a paid OpenAI call, so it must be authenticated —
  // middleware does not cover /api routes.
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { labelA, labelB, avgs, choices } = body ?? {};
  if (!Array.isArray(avgs) || !choices || typeof choices !== 'object') {
    return NextResponse.json({ error: 'Missing comparison data.' }, { status: 400 });
  }

  const safeLabelA = String(labelA ?? 'Speech A').slice(0, 120);
  const safeLabelB = String(labelB ?? 'Speech B').slice(0, 120);

  const rows = avgs.map((m: { key: string; a: number; b: number; diff: number }) =>
    `  ${String(m.key).slice(0, 40)}: ${safeLabelA}=${Number(m.a)}, ${safeLabelB}=${Number(m.b)}, difference=${Number(m.diff) > 0 ? '+' : ''}${Number(m.diff)}`
  ).join('\n');

  const includeList = Array.isArray(choices.include)
    ? (choices.include as unknown[]).filter((s): s is string => SECTIONS.includes(s as string))
    : [];
  const sections = (includeList.length ? includeList : SECTIONS).join(', ');
  const tone = oneOf(choices.tone, TONES, 'professional');
  const audience = oneOf(choices.audience, AUDIENCES, 'the speaker');
  const length = oneOf(choices.length, LENGTHS, 'medium');

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

Speech A: "${safeLabelA}"
Speech B: "${safeLabelB}"

Neural scores (0–100):
${rows}

Remember: for DMN, lower scores are better (less mind-wandering). For all others, higher is better.

Write the report now.`;

  try {
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
  } catch (err) {
    console.error('[compare-report] generation failed', err);
    return NextResponse.json({ error: 'Could not generate the report.' }, { status: 502 });
  }
}
