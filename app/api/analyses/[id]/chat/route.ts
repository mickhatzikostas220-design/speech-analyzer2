import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';
import { NextRequest } from 'next/server';

export const maxDuration = 60;

function formatMs(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function buildSystemPrompt(analysis: Record<string, unknown>, feedbackPoints: Record<string, unknown>[]) {
  const peaks = (analysis.peak_moments as { start_ms: number; end_ms: number; score: number }[] | null) ?? [];
  const wordResponses = (analysis.word_responses as { word: string; score: number; emotional: number; memory: number; prosody: number }[] | null) ?? [];
  const brainAct = analysis.overall_brain_activations as Record<string, number> | null;

  const topWords = [...wordResponses]
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(w => `"${w.word}" (engagement:${w.score} emotional:${w.emotional} memory:${w.memory} prosody:${w.prosody})`)
    .join(', ');

  const bottomWords = [...wordResponses]
    .sort((a, b) => a.score - b.score)
    .slice(0, 5)
    .map(w => `"${w.word}" (${w.score})`)
    .join(', ');

  const feedbackSummary = feedbackPoints.map((fp, i) => {
    const f = fp as { timecode_ms: number; timecode_end_ms: number; engagement_score: number; severity: string; feedback_text: string; improvement_suggestion: string };
    return `${i + 1}. ${formatMs(f.timecode_ms)}–${formatMs(f.timecode_end_ms)} (score: ${f.engagement_score}/100, ${f.severity} drop)\n   What happened: ${f.feedback_text}\n   Fix: ${f.improvement_suggestion}`;
  }).join('\n');

  const peakSummary = peaks.map((p, i) =>
    `${i + 1}. ${formatMs(p.start_ms)}–${formatMs(p.end_ms)} (score: ${p.score}/100)`
  ).join('\n');

  return `You are ACA's speech analysis assistant. You have complete neural data for this speech, powered by Facebook's Tribe v2 fMRI brain encoding model. Help the speaker understand their results — be conversational, specific, and actionable.

## Speech: "${analysis.title}"
Duration: ${analysis.duration_seconds}s

## Neural Scores (0–100)
- Overall Engagement: ${analysis.overall_score}/100
- Cognitive Load (Attention network): ${analysis.cognitive_load_score}/100
- Mind-Wandering Risk (DMN): ${analysis.mind_wandering_score}/100

## Score guide
Higher is better for: Engagement, Auditory, Language, Attention, Prosody, Emotional, Memory
Lower is better for: DMN (high DMN = audience zoning out)

## Overall Brain Activations
${brainAct ? Object.entries(brainAct).map(([k, v]) => `- ${k}: ${(v * 100).toFixed(1)}%`).join('\n') : 'Not available'}

## Peak Moments (highest engagement)
${peakSummary || 'None detected'}

## Engagement Drops (moments below 55/100)
${feedbackSummary || 'None detected — strong speech throughout'}

## Highest-activation words
${topWords || 'Not available'}

## Lowest-activation words
${bottomWords || 'Not available'}

## Transcript
${(analysis.transcript as string | null) || 'Not available'}

Keep answers concise and specific. Reference timestamps when relevant. Don't dump all the data back at the user — just answer their question using the data.`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { messages } = await request.json();
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response('Bad request', { status: 400 });
  }

  const [{ data: analysis }, { data: feedbackPoints }] = await Promise.all([
    supabase.from('analyses').select('*').eq('id', params.id).eq('user_id', user.id).single(),
    supabase.from('feedback_points').select('*').eq('analysis_id', params.id).order('timecode_ms'),
  ]);

  if (!analysis) return new Response('Not found', { status: 404 });
  if (analysis.status !== 'complete') {
    return new Response('Analysis not complete yet', { status: 422 });
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const stream = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 1024,
    messages: [
      { role: 'system', content: buildSystemPrompt(analysis, feedbackPoints ?? []) },
      ...messages,
    ],
    stream: true,
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content ?? '';
        if (text) controller.enqueue(encoder.encode(text));
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
