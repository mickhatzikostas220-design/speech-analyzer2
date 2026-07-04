// Stage Finder API: given a few speakers the user admires (plus their own topic
// and preferred format), build a pitch pack — similar speakers, the events the
// admired speakers actually appear at, real events to pitch, and an outreach
// email. Two steps: (1) a web-search pass (OpenAI Responses API + web_search
// tool) gathers real, cited facts about appearances and current events; (2) a
// GPT-4o JSON call structures the report, grounded in those findings so the
// appearances and events are backed by real sources (surfaced as links) instead
// of the model's memory. Runs on the app-wide OpenAI key, like the SEO tool.
// Core Premium — gated here for defense in depth (the page layout gates the UI).
// Stateless: nothing is persisted, results are generated on demand.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserPlan } from '@/lib/subscription/server';
import { requirePlan } from '@/lib/subscription/requirePlan';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { createChatCompletion, hasAiKey } from '@/lib/ai-config';
import { runWebSearch, type WebSearchFindings } from '@/lib/stagefinder/webSearch';
import {
  isSpeakingFormat,
  speakingFormatLabel,
  type StageReport,
  type SimilarSpeaker,
  type SpeakerAppearance,
  type StageEvent,
  type OutreachTemplate,
} from '@/lib/stagefinder/types';

export const maxDuration = 60;

const MAX_SPEAKERS = 5;
const MAX_NAME_LEN = 80;
const MAX_TOPIC_LEN = 300;
// Cap how many source URLs we feed the JSON model so the grounding prompt stays
// a sane size no matter how much the search call cited.
const MAX_SOURCES_IN_PROMPT = 20;

/** Keep only real http(s) URLs; anything else (junk, made-up refs) becomes ''. */
function cleanUrl(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const u = raw.trim();
  return /^https?:\/\//i.test(u) ? u : '';
}

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
    sourceUrl: cleanUrl(e.sourceUrl),
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

/** Coerce one admired speaker's real appearances into a clean SpeakerAppearance. */
function normalizeAppearance(raw: unknown): SpeakerAppearance {
  const a = (raw ?? {}) as Record<string, unknown>;
  const events = Array.isArray(a.events)
    ? a.events
        .map((ev) => {
          const e = (ev ?? {}) as Record<string, unknown>;
          return {
            name: typeof e.name === 'string' ? e.name : '',
            format: typeof e.format === 'string' ? e.format : '',
            note: typeof e.note === 'string' ? e.note : '',
            sourceUrl: cleanUrl(e.sourceUrl),
          };
        })
        .filter((e) => e.name)
    : [];
  return {
    speaker: typeof a.speaker === 'string' ? a.speaker : '',
    events,
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

  // Step 1 — gather REAL, current facts via web search so the appearances and the
  // recommended events are grounded in what's actually out there (with sources),
  // not the model's memory. If search fails we degrade to an ungrounded report
  // rather than 500ing, so the tool still works.
  const searchPrompt = `You are researching for a speaker-booking tool. Use web search to find real, verifiable facts.

Speakers the user admires: ${speakers.map((s) => `"${s}"`).join(', ')}.
${topic ? `The user speaks about: "${topic}".` : ''}
Preferred speaking format: ${speakingFormatLabel(format)}.

Find and report, citing your sources:
1. For EACH admired speaker, real, documented events / conferences / stages / podcasts / shows they have actually spoken at or appeared on — recent and notable. Give the event name and, when available, the talk title, role, or year.
2. Real, currently-running events, conferences, series, or shows in this same world that book outside speakers — especially ones with an open Call for Speakers (CFP) or a public speaker-application path. Note what the event is and how a speaker gets on it.

Only report things you can actually find sources for. Do not guess or invent events, appearances, or URLs. Write a clear, organized brief.`;

  let findings: WebSearchFindings = { text: '', sources: [] };
  try {
    findings = await runWebSearch(searchPrompt);
  } catch (err) {
    console.error('Stage Finder web search failed (continuing ungrounded):', err);
  }

  const sourceList = findings.sources
    .slice(0, MAX_SOURCES_IN_PROMPT)
    .map((s) => `- ${s.url}${s.title ? ` (${s.title})` : ''}`)
    .join('\n');

  // Only injected when search actually returned something. When empty, the prompt
  // falls back to the model's own knowledge with the same "don't fabricate" rules.
  const groundingBlock = findings.text
    ? `\nUse the following web research findings as your SOURCE OF TRUTH for real appearances and real events. Do not include any appearance or event that these findings do not support. Prefer these over your own memory.

WEB FINDINGS:
${findings.text}
${sourceList ? `\nSOURCE URLS you may cite (attach the single most relevant one to each appearance and each event via "sourceUrl", or leave "sourceUrl" empty if none clearly supports it — never attach a URL that doesn't match):\n${sourceList}` : ''}
`
    : '';

  const prompt = `You are a speaker-booking strategist helping a public speaker find stages to pitch themselves to.

The speaker admires these speakers: ${speakers.map((s) => `"${s}"`).join(', ')}.
${topic ? `The speaker's own topic / expertise is: "${topic}".` : 'The speaker did not give their own topic — infer a fit from the admired speakers.'}
Preferred speaking format: ${speakingFormatLabel(format)}.
${groundingBlock}
Do four things:
1. For EACH speaker the user admires (${speakers.map((s) => `"${s}"`).join(', ')}), list the notable, REAL events / conferences / stages / podcasts / platforms where that specific speaker has genuinely and publicly appeared. These are the events those speakers actually speak at — their real footprint — not events you are recommending. ${findings.text ? 'Base these strictly on the WEB FINDINGS above and attach a matching "sourceUrl" where one supports the appearance.' : 'Only include appearances you are reasonably confident are real and publicly documented; if you are unsure about a particular speaker, include fewer (or none) rather than guessing.'} For each appearance give a short note (talk title, role, or year) only when you actually know it — otherwise leave the note empty. Do NOT fabricate appearances, dates, or talk titles.
2. Find 4–6 SIMILAR speakers — real, recognizable people who occupy the same world (topic, style, or audience tier) as the admired set${topic ? ' and the speaker\'s own topic' : ''}. For each, one line on what they're known for and one line on why they're similar.
3. Find 5–8 real EVENTS, conferences, series, or shows where speakers of this kind actually appear — the kinds of stages this speaker could realistically pitch. ${findings.text ? 'Prefer the events surfaced in the WEB FINDINGS above and attach a matching "sourceUrl" where one supports the event.' : 'Prefer real, well-known event series and communities over invented names.'} For each event give: its typical audience, why it fits THIS speaker, which admired/similar speakers are genuinely associated with that world (only names you're confident belong there — do not fabricate specific appearances), a concrete talk/topic ANGLE this speaker could pitch, and practical guidance on HOW to approach it (e.g. look for its Call for Speakers / CFP page, apply through its speaker form, or contact the organizer/programming team — be specific about the realistic path).
4. Write one short, adaptable OUTREACH email the speaker could send to an event organizer to propose themselves — warm, specific, and easy to personalize.

Be honest and practical. If you are not certain an event still runs or accepts pitches, phrase the "howToApproach" so the speaker verifies it themselves. Never invent contact emails or URLs — only use URLs from the SOURCE URLS list above.

Respond with ONLY valid JSON in this exact shape:
{
  "summary": "one or two sentences on where this speaker fits and the opportunity",
  "speakerAppearances": [{ "speaker": "the admired speaker's name", "events": [{ "name": "...", "format": "e.g. Annual conference / Podcast / Corporate keynote", "note": "talk title, role, or year if known — else empty string", "sourceUrl": "a matching URL from the SOURCE URLS list, or empty string" }] }],
  "similarSpeakers": [{ "name": "...", "knownFor": "one line", "whySimilar": "one line" }],
  "events": [{
    "name": "...",
    "format": "e.g. Annual conference / Corporate summit / Weekly podcast",
    "audience": "who attends or listens",
    "whyFit": "why this fits the speaker",
    "speakersSeen": ["name", "name"],
    "pitchAngle": "a specific talk/topic angle to pitch",
    "howToApproach": "the realistic path to get on this stage",
    "sourceUrl": "a matching URL from the SOURCE URLS list (event/CFP page), or empty string"
  }],
  "outreach": { "subject": "...", "body": "the email body, with [brackets] for details the speaker fills in" }
}
No markdown, no code fences.`;

  let report: StageReport;
  try {
    const completion = await createChatCompletion('gpt-4o', {
      // Bumped from 3000 to fit the added per-speaker appearances section without
      // risking a truncated (unparseable) JSON response.
      max_tokens: 4000,
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    });
    const rawText = completion.choices[0]?.message?.content ?? '';
    const parsed = JSON.parse(rawText) as {
      summary?: string;
      speakerAppearances?: unknown[];
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
      // Only keep admired speakers we actually surfaced real appearances for —
      // an empty list means the model wasn't confident, so we don't show a card.
      speakerAppearances: Array.isArray(parsed.speakerAppearances)
        ? parsed.speakerAppearances
            .map(normalizeAppearance)
            .filter((a) => a.speaker && a.events.length > 0)
        : [],
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
