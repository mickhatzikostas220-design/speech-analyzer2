// Stage Finder API: given a few speakers the user admires (plus their own topic
// and preferred format), ask GPT-4o for similar speakers, the kinds of events
// those speakers appear at, and a compiled pitch pack + outreach email so the
// user can approach those events. Runs on the app-wide OpenAI key, like the SEO
// tool. Core Premium — gated here for defense in depth (the page layout gates
// the UI). Stateless: nothing is persisted, results are generated on demand.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserPlan } from '@/lib/subscription/server';
import { requirePlan } from '@/lib/subscription/requirePlan';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { createChatCompletion, hasAiKey } from '@/lib/ai-config';
import {
  isSpeakingFormat,
  speakingFormatLabel,
  type StageReport,
  type SimilarSpeaker,
  type StageEvent,
  type OutreachTemplate,
} from '@/lib/stagefinder/types';

export const maxDuration = 60;

const MAX_SPEAKERS = 5;
const MAX_NAME_LEN = 80;
const MAX_TOPIC_LEN = 300;

/** Coerce whatever the model returned into a clean StageEvent. */
function normalizeEvent(raw: unknown): StageEvent {
  const e = (raw ?? {}) as Record<string, unknown>;
  return {
    name: typeof e.name === 'string' ? e.name : '',
    format: typeof e.format === 'string' ? e.format : '',
    audience: typeof e.audience === 'string' ? e.audience : '',
    whyFit: typeof e.whyFit === 'string' ? e.whyFit : '',
    speakersSeen: Array.isArray(e.speakersSeen)
      ? e.speakersSeen.filter((s): s is string => typeof s === 'string')
      : [],
    pitchAngle: typeof e.pitchAngle === 'string' ? e.pitchAngle : '',
    howToApproach: typeof e.howToApproach === 'string' ? e.howToApproach : '',
  };
}

function normalizeSpeaker(raw: unknown): SimilarSpeaker {
  const s = (raw ?? {}) as Record<string, unknown>;
  return {
    name: typeof s.name === 'string' ? s.name : '',
    knownFor: typeof s.knownFor === 'string' ? s.knownFor : '',
    whySimilar: typeof s.whySimilar === 'string' ? s.whySimilar : '',
  };
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const limit = rateLimit(`stagefinder:${clientIp(request)}`, 10, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a few minutes.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
    );
  }

  // Core Premium feature — same tier as Booking Inbox and Keynote Tailoring.
  const gate = await requirePlan(supabase, 'core');
  if (gate) return gate;

  if (!hasAiKey()) {
    return NextResponse.json({ error: 'Stage Finder is not configured yet.' }, { status: 503 });
  }

  let body: { speakers?: unknown; topic?: unknown; format?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const speakers = Array.isArray(body.speakers)
    ? body.speakers
        .filter((s): s is string => typeof s === 'string')
        .map((s) => s.trim().slice(0, MAX_NAME_LEN))
        .filter(Boolean)
        .slice(0, MAX_SPEAKERS)
    : [];

  if (speakers.length === 0) {
    return NextResponse.json(
      { error: 'Add at least one speaker you admire so we know where to look.' },
      { status: 400 }
    );
  }

  const topic = typeof body.topic === 'string' ? body.topic.trim().slice(0, MAX_TOPIC_LEN) : '';
  const format = isSpeakingFormat(body.format) ? body.format : 'any';

  const prompt = `You are a speaker-booking strategist helping a public speaker find stages to pitch themselves to.

The speaker admires these speakers: ${speakers.map((s) => `"${s}"`).join(', ')}.
${topic ? `The speaker's own topic / expertise is: "${topic}".` : 'The speaker did not give their own topic — infer a fit from the admired speakers.'}
Preferred speaking format: ${speakingFormatLabel(format)}.

Do three things:
1. Find 4–6 SIMILAR speakers — real, recognizable people who occupy the same world (topic, style, or audience tier) as the admired set${topic ? ' and the speaker\'s own topic' : ''}. For each, one line on what they're known for and one line on why they're similar.
2. Find 5–8 real EVENTS, conferences, series, or shows where speakers of this kind actually appear — the kinds of stages this speaker could realistically pitch. Prefer real, well-known event series and communities over invented names. For each event give: its typical audience, why it fits THIS speaker, which admired/similar speakers are genuinely associated with that world (only names you're confident belong there — do not fabricate specific appearances), a concrete talk/topic ANGLE this speaker could pitch, and practical guidance on HOW to approach it (e.g. look for its Call for Speakers / CFP page, apply through its speaker form, or contact the organizer/programming team — be specific about the realistic path).
3. Write one short, adaptable OUTREACH email the speaker could send to an event organizer to propose themselves — warm, specific, and easy to personalize.

Be honest and practical. If you are not certain an event still runs or accepts pitches, phrase the "howToApproach" so the speaker verifies it themselves. Never invent contact emails or URLs.

Respond with ONLY valid JSON in this exact shape:
{
  "summary": "one or two sentences on where this speaker fits and the opportunity",
  "similarSpeakers": [{ "name": "...", "knownFor": "one line", "whySimilar": "one line" }],
  "events": [{
    "name": "...",
    "format": "e.g. Annual conference / Corporate summit / Weekly podcast",
    "audience": "who attends or listens",
    "whyFit": "why this fits the speaker",
    "speakersSeen": ["name", "name"],
    "pitchAngle": "a specific talk/topic angle to pitch",
    "howToApproach": "the realistic path to get on this stage"
  }],
  "outreach": { "subject": "...", "body": "the email body, with [brackets] for details the speaker fills in" }
}
No markdown, no code fences.`;

  let report: StageReport;
  try {
    const completion = await createChatCompletion('gpt-4o', {
      max_tokens: 3000,
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    });
    const rawText = completion.choices[0]?.message?.content ?? '';
    const parsed = JSON.parse(rawText) as {
      summary?: string;
      similarSpeakers?: unknown[];
      events?: unknown[];
      outreach?: { subject?: unknown; body?: unknown };
    };

    const outreach: OutreachTemplate | null =
      parsed.outreach &&
      typeof parsed.outreach.subject === 'string' &&
      typeof parsed.outreach.body === 'string'
        ? { subject: parsed.outreach.subject, body: parsed.outreach.body }
        : null;

    report = {
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      similarSpeakers: Array.isArray(parsed.similarSpeakers)
        ? parsed.similarSpeakers.map(normalizeSpeaker).filter((s) => s.name)
        : [],
      events: Array.isArray(parsed.events)
        ? parsed.events.map(normalizeEvent).filter((e) => e.name)
        : [],
      outreach,
    };
  } catch (err) {
    console.error('Stage Finder failed:', err);
    return NextResponse.json(
      { error: 'Could not build your stage list right now. Please try again.' },
      { status: 502 }
    );
  }

  const plan = await getUserPlan(supabase);
  return NextResponse.json({ report, plan });
}
