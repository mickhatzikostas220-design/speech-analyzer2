// Content Ideas API: turn a speaker's expertise + brand voice into 20–30 blog /
// video / short titles that (a) answer things people actually search for and
// (b) sound like the speaker (their tone, e.g. snarky, warm, polished).
//
// Two steps: (1) a live web-search pass gathers the REAL questions and trending
// subtopics people search in the speaker's space (so titles carry genuine search
// value, not made-up keywords); (2) a GPT-4o JSON call writes the titles, grounded
// in those searches and voiced in the speaker's brand tone (read from their brand
// kit + memory, not re-asked). Runs on the app-wide OpenAI key, like the SEO and
// Stage Finder tools. Core Premium — gated here for defense in depth (the page
// layout gates the UI). Stateless: nothing is persisted.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserPlan } from '@/lib/subscription/server';
import { requirePlan } from '@/lib/subscription/requirePlan';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { createChatCompletion, hasAiKey } from '@/lib/ai-config';
import { getUserBrandState } from '@/lib/brand/server';
import { DEFAULT_BRAND } from '@/lib/brand/defaults';
import { getMemoryFacts } from '@/lib/memory/store';
import { runWebSearch, type WebSearchFindings } from '@/lib/stagefinder/webSearch';
import {
  isContentFormat,
  contentFormatLabel,
  type ContentIdea,
  type ContentIdeaReport,
  type ContentFormatId,
} from '@/lib/contentideas/types';

export const maxDuration = 60;

const MAX_TOPIC_LEN = 300;
const MAX_VOICE_LEN = 200;
const MAX_SOURCES_IN_PROMPT = 20;

/** Coerce one raw idea into a clean ContentIdea, or null if unusable. */
function normalizeIdea(raw: unknown): ContentIdea | null {
  const i = (raw ?? {}) as Record<string, unknown>;
  const title = typeof i.title === 'string' ? i.title.trim() : '';
  if (!title) return null;
  const format: ContentFormatId = isContentFormat(i.format) ? i.format : 'blog';
  return {
    title,
    format,
    angle: typeof i.angle === 'string' ? i.angle.trim() : '',
    keyword: typeof i.keyword === 'string' ? i.keyword.trim() : '',
  };
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const limit = rateLimit(`contentideas:${clientIp(request)}`, 12, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a few minutes.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
    );
  }

  // Core Premium feature — same tier as Stage Finder and Keynote Tailoring.
  const gate = await requirePlan(supabase, 'core');
  if (gate) return gate;

  if (!hasAiKey()) {
    return NextResponse.json({ error: 'Content Ideas is not configured yet.' }, { status: 503 });
  }

  let body: { topic?: unknown; voice?: unknown; format?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const topicInput = typeof body.topic === 'string' ? body.topic.trim().slice(0, MAX_TOPIC_LEN) : '';
  const voiceInput = typeof body.voice === 'string' ? body.voice.trim().slice(0, MAX_VOICE_LEN) : '';
  // 'all' (or anything unrecognized) = a natural mix across formats.
  const formatBias: ContentFormatId | 'all' = isContentFormat(body.format) ? body.format : 'all';

  // Pull who the user is from their brand kit (collected at onboarding) so titles
  // sit inside their expertise and sound like them — no re-asking. Guard against
  // the default seed kit (non-branded users), which isn't a real speaker.
  const { brand } = await getUserBrandState();
  const hasRealBrand = brand.source !== 'default';
  const brandTopics = hasRealBrand
    ? (brand.oneSheet?.topics ?? []).map((t) => t.title).filter(Boolean)
    : [];
  const brandBio = hasRealBrand ? brand.oneSheet?.bio || brand.voice?.about || '' : '';
  const brandAiProfile = hasRealBrand ? brand.voice?.aiProfile || '' : '';
  const brandTone = hasRealBrand && brand.voice?.tone && brand.voice.tone !== DEFAULT_BRAND.voice.tone
    ? brand.voice.tone
    : '';

  // The effective expertise the ideas orbit around: an explicit topic wins,
  // otherwise fall back to the speaker's brand topics / bio.
  const focus = topicInput || brandTopics.join('; ') || brandBio;
  if (!focus) {
    return NextResponse.json(
      {
        error:
          'Tell us what you speak about (add a topic below) or brand your hub with your website so we know your expertise.',
      },
      { status: 400 }
    );
  }

  // The voice to write in: an explicit hint wins, else the brand tone.
  const voice = voiceInput || brandTone;

  // Fold in remembered facts (audience, goals, pet peeves, running themes).
  const memoryFacts = await getMemoryFacts(supabase, user.id);
  const profileBits: string[] = [];
  if (brandTopics.length) profileBits.push(`Speaks on: ${brandTopics.join('; ')}`);
  if (brandBio) profileBits.push(`Bio: ${brandBio}`);
  if (brandAiProfile) profileBits.push(`Speaker profile: ${brandAiProfile}`);
  for (const fact of memoryFacts) profileBits.push(`Remembered: ${fact}`);
  const profileContext = profileBits.join('\n').slice(0, 1500);

  // Step 1 — find the REAL questions and trending subtopics people search in this
  // space, so the titles have genuine search demand behind them. Degrades to
  // ungrounded generation if search fails.
  let findings: WebSearchFindings = { text: '', sources: [] };
  try {
    findings = await runWebSearch(
      `Use web search to research search demand around this speaker's expertise: "${focus}".

Find and list, with sources:
1. The specific questions people most commonly ask / search about this topic — real "People Also Ask" style queries and long-tail questions.
2. Trending or rising subtopics, debates, myths, and pain points in this space right now (2025–2026).
3. The exact phrases and keywords someone would type into Google or ask an AI assistant.

Report concrete search phrases and questions, not general commentary. Do not invent statistics.`,
      { maxOutputTokens: 1800, searchContextSize: 'high' }
    );
  } catch (err) {
    console.error('Content Ideas web search failed (continuing ungrounded):', err);
  }

  const sourceList = findings.sources
    .slice(0, MAX_SOURCES_IN_PROMPT)
    .map((s) => `- ${s.url}${s.title ? ` (${s.title})` : ''}`)
    .join('\n');

  const groundingBlock = findings.text
    ? `\nUse these live web-search findings as the SOURCE OF TRUTH for what people actually search — anchor titles to these real questions and phrases rather than inventing keywords:

SEARCH FINDINGS:
${findings.text}
${sourceList ? `\n(Reference sources — for your grounding only; do not put URLs in the output.)\n${sourceList}` : ''}
`
    : '';

  const voiceLine = voice
    ? `Write every title in this BRAND VOICE: "${voice}". The voice is the point — titles should unmistakably sound like this speaker (e.g. if the voice is snarky/witty, make them a little cheeky or provocative), while STILL matching how people actually search. Blend search intent with personality; never sacrifice one for the other.`
    : `Write the titles in a confident, human, lightly opinionated voice with personality — not bland SEO filler.`;

  const formatLine =
    formatBias === 'all'
      ? 'Mix the formats: some "blog" (deeper, how-to/list/opinion), some "video" (YouTube-style, longer watch), some "short" (punchy Reel/TikTok/Short hooks).'
      : `Lean heavily toward "${formatBias}" (${contentFormatLabel(formatBias)}) titles, but you may include a few of the others where a topic clearly fits them better.`;

  const prompt = `You are a content strategist for a public speaker. Generate 24–30 content TITLES (blog posts, videos, and shorts) that this speaker could make. Each must do two jobs at once: (1) have real search value — it answers a question people actually look up or taps a trending subtopic — and (2) sound like THIS speaker's brand.

The speaker's expertise / focus: "${focus}".
${profileContext ? `About the speaker:\n${profileContext}` : ''}
${groundingBlock}
${voiceLine}
${formatLine}

Rules:
- Titles must stay INSIDE the speaker's expertise above — no random topics.
- Prefer titles that answer a clear question, settle a debate, bust a myth, or promise a concrete outcome — the stuff people search and click.
- Make them specific and non-generic. "How to be a better speaker" is weak; a sharp, voice-driven angle on a real search is strong.
- Vary the angle: how-tos, listicles, myth-busters, hot takes, "X vs Y", "what nobody tells you about…", question titles.
- For "angle", say the real search intent / question it answers and why it will get found. For "keyword", give the core phrase someone would actually type.

Respond with ONLY valid JSON in this exact shape:
{
  "summary": "one or two sentences on the strategy behind this batch for this speaker",
  "ideas": [
    { "title": "the title, in the brand voice", "format": "blog" | "video" | "short", "angle": "the search intent it answers and why it gets found", "keyword": "the core search phrase" }
  ]
}
Return 24–30 ideas. No markdown, no code fences.`;

  let report: ContentIdeaReport;
  try {
    const completion = await createChatCompletion('gpt-4o', {
      max_tokens: 4000,
      temperature: 0.85,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    });
    const rawText = completion.choices[0]?.message?.content ?? '';
    const parsed = JSON.parse(rawText) as { summary?: string; ideas?: unknown[] };
    const ideas = Array.isArray(parsed.ideas)
      ? parsed.ideas.map(normalizeIdea).filter((i): i is ContentIdea => i !== null)
      : [];
    if (ideas.length === 0) {
      return NextResponse.json(
        { error: 'Could not generate ideas right now. Please try again.' },
        { status: 502 }
      );
    }
    report = {
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      ideas,
    };
  } catch (err) {
    console.error('Content Ideas failed:', err);
    return NextResponse.json(
      { error: 'Could not generate ideas right now. Please try again.' },
      { status: 502 }
    );
  }

  const plan = await getUserPlan(supabase);
  return NextResponse.json({ report, plan });
}
