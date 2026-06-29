import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';
import { rateLimit, clientIp } from '@/lib/rateLimit';

// Created lazily inside the handler — instantiating at module scope throws
// when OPENAI_API_KEY is missing during `next build`, which breaks the build.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  // Gate on auth + rate limit: this route calls GPT-4o on every request, so
  // leaving it open turns it into an anonymous cost-amplification / DoS sink.
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const limit = rateLimit(`compare:${user.id}`, 10, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a few minutes.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
    );
  }

  let body: { labelA?: unknown; labelB?: unknown; avgs?: unknown; choices?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const { labelA, labelB, avgs, choices } = body as {
    labelA?: string;
    labelB?: string;
    avgs?: { key: string; a: number; b: number; diff: number }[];
    choices?: { include?: string[]; tone?: string; audience?: string; length?: string };
  };

  if (!Array.isArray(avgs) || avgs.length === 0 || !choices || !Array.isArray(choices.include)) {
    return NextResponse.json({ error: 'Missing comparison data.' }, { status: 400 });
  }

  const rows = avgs.map((m) =>
    `  ${m.key}: ${labelA}=${m.a}, ${labelB}=${m.b}, difference=${m.diff > 0 ? '+' : ''}${m.diff}`
  ).join('\n');

  const sections = choices.include.join(', ');
  const tone = choices.tone ?? 'professional';
  const audience = choices.audience ?? 'the speaker';
  const length = choices.length ?? 'medium';

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
    return NextResponse.json({ error: 'Report generation is not configured.' }, { status: 503 });
  }

  try {
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
  } catch (err) {
    console.error('compare-report generation failed:', err);
    return NextResponse.json({ error: 'Could not generate the report right now.' }, { status: 502 });
  }
}
