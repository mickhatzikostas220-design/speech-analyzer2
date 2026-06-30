import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { aiClientOptions, chatModel } from '@/lib/ai-config';
import { createClient } from '@/lib/supabase/server';
import { rateLimit, clientIp } from '@/lib/rateLimit';

// Created lazily inside the handler — instantiating at module scope throws
// when OPENAI_API_KEY is missing during `next build`, which breaks the build.
export const maxDuration = 60;

// Keep free-text choices short so they can't be used to smuggle a huge prompt
// (cost abuse) or run away with the token budget.
const clampStr = (v: unknown, max = 60): string =>
  typeof v === 'string' ? v.replace(/[\r\n]+/g, ' ').trim().slice(0, max) : '';

export async function POST(request: NextRequest) {
  // Require a signed-in user: this runs a billed GPT-4o completion, so leaving
  // it open let anyone use it as a free LLM proxy / drive up our AI bill.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const limit = rateLimit(`compare-report:${user.id}:${clientIp(request)}`, 10, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many report requests. Please wait a few minutes.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const { labelA: rawA, labelB: rawB, avgs: rawAvgs, choices: rawChoices } = body;
  const choices = (rawChoices ?? {}) as Record<string, unknown>;

  if (!Array.isArray(rawAvgs) || rawAvgs.length === 0) {
    return NextResponse.json({ error: 'No metrics to compare.' }, { status: 400 });
  }

  const labelA = clampStr(rawA, 120) || 'Speech A';
  const labelB = clampStr(rawB, 120) || 'Speech B';

  const rows = (rawAvgs as { key?: unknown; a?: unknown; b?: unknown; diff?: unknown }[])
    .slice(0, 32)
    .map((m) => {
      const diff = Number(m.diff) || 0;
      return `  ${clampStr(m.key, 40)}: ${labelA}=${Number(m.a) || 0}, ${labelB}=${Number(m.b) || 0}, difference=${diff > 0 ? '+' : ''}${diff}`;
    })
    .join('\n');

  const sections = (Array.isArray(choices.include) ? choices.include : [])
    .map((s) => clampStr(s, 40))
    .filter(Boolean)
    .slice(0, 12)
    .join(', ');
  const tone = clampStr(choices.tone);
  const audience = clampStr(choices.audience);
  const length = clampStr(choices.length);

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

  const openai = new OpenAI(aiClientOptions());
  const response = await openai.chat.completions.create({
    model: chatModel('gpt-4o'),
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
