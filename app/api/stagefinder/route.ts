// Stage Finder API: given a few speakers the user admires (plus their topic, fee,
// and preferred format) and the user's identity from onboarding (name, website,
// bio, topics — read from their brand kit, not re-asked), build a pitch pack:
// where the admired speakers actually appear, peers to follow at the user's OWN
// level, real events the user could realistically land, and an outreach email.
// Two steps: (1) a web-search pass (OpenAI Responses API + web_search tool)
// gathers real, cited facts about appearances, current events, and the user's own
// speaking footprint (looked up by their onboarding name/website);
// (2) a GPT-4o JSON call structures the report, grounded in those findings so the
// appearances and events are backed by real sources (surfaced as links) and the
// recommendations are calibrated to the user's level (their footprint + fee)
// instead of the model's memory. Runs on the app-wide OpenAI key, like the SEO tool.
// Core Premium — gated here for defense in depth (the page layout gates the UI).
// Stateless: nothing is persisted, results are generated on demand.
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
  isSpeakingFormat,
  speakingFormatLabel,
  type StageReport,
  type SimilarSpeaker,
  type SpeakerAppearance,
  type SpeakerAppearanceEvent,
  type StageEvent,
  type OutreachTemplate,
} from '@/lib/stagefinder/types';

export const maxDuration = 60;

const MAX_SPEAKERS = 5;
const MAX_NAME_LEN = 80;
const MAX_TOPIC_LEN = 300;
const MAX_RATE_LEN = 60;
// Cap how many source URLs we feed the JSON model so the grounding prompt stays
// a sane size no matter how much the search call cited.
const MAX_SOURCES_IN_PROMPT = 20;

/** Keep only real http(s) URLs; anything else (junk, made-up refs) becomes ''. */
function cleanUrl(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const u = raw.trim();
  return /^https?:\/\//i.test(u) ? u : '';
}

/** Coerce one raw appearance/event entry into a clean SpeakerAppearanceEvent. */
function normalizeAppearanceEvent(raw: unknown): SpeakerAppearanceEvent {
  const e = (raw ?? {}) as Record<string, unknown>;
  return {
    name: typeof e.name === 'string' ? e.name : '',
    format: typeof e.format === 'string' ? e.format : '',
    note: typeof e.note === 'string' ? e.note : '',
    sourceUrl: cleanUrl(e.sourceUrl),
  };
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
    events: Array.isArray(s.events)
      ? s.events.map(normalizeAppearanceEvent).filter((e) => e.name)
      : [],
  };
}

/** Coerce one admired speaker's real appearances into a clean SpeakerAppearance. */
function normalizeAppearance(raw: unknown): SpeakerAppearance {
  const a = (raw ?? {}) as Record<string, unknown>;
  return {
    speaker: typeof a.speaker === 'string' ? a.speaker : '',
    events: Array.isArray(a.events)
      ? a.events.map(normalizeAppearanceEvent).filter((e) => e.name)
      : [],
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

  let body: { speakers?: unknown; topic?: unknown; rate?: unknown; format?: unknown };
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
  // Fee is the one level-signal we don't collect at onboarding, so it stays a
  // manual field. The rest (identity, bio, topics) comes from the brand kit below.
  const rate = typeof body.rate === 'string' ? body.rate.trim().slice(0, MAX_RATE_LEN) : '';
  const format = isSpeakingFormat(body.format) ? body.format : 'any';

  // Pull who the user is from the data collected at onboarding (their brand kit)
  // instead of asking again — so we can search THEIR footprint and calibrate to
  // their level. Guard against the default seed kit (non-branded users), which
  // isn't a real person and must never be searched as one.
  const { brand, websiteUrl } = await getUserBrandState();
  const hasRealBrand = brand.source !== 'default';
  const userName = brand.name && brand.name !== DEFAULT_BRAND.name ? brand.name.slice(0, MAX_NAME_LEN) : '';
  const userSite = websiteUrl || (hasRealBrand ? brand.sourceUrl ?? '' : '') || '';

  // Rich context for calibration — only from a real, branded kit so we never feed
  // the default seed copy. aiProfile is the private onboarding profile meant for
  // exactly this kind of AI use.
  const profileBits: string[] = [];
  if (hasRealBrand) {
    if (brand.oneSheet?.bio) profileBits.push(`Bio: ${brand.oneSheet.bio}`);
    const topics = (brand.oneSheet?.topics ?? []).map((t) => t.title).filter(Boolean);
    if (topics.length) profileBits.push(`Speaks on: ${topics.join('; ')}`);
    if (brand.voice?.aiProfile) profileBits.push(`Speaker profile: ${brand.voice.aiProfile}`);
    else if (brand.voice?.about) profileBits.push(`About: ${brand.voice.about}`);
  }
  // Fold in anything the app has remembered about this speaker (goals, style,
  // audience) so recommendations calibrate to them, not just their public bio.
  const memoryFacts = await getMemoryFacts(supabase, user.id);
  for (const fact of memoryFacts) profileBits.push(`Remembered: ${fact}`);
  const profileContext = profileBits.join('\n').slice(0, 1500);

  // Step 1 — gather REAL, current facts via web search so the appearances and the
  // recommended events are grounded in what's actually out there (with sources),
  // not the model's memory. If search fails we degrade to an ungrounded report
  // rather than 500ing, so the tool still works.
  const searchPrompt = `You are researching for a speaker-booking tool. Use web search to find real, verifiable facts.

Speakers the user admires: ${speakers.map((s) => `"${s}"`).join(', ')}.
${topic ? `The user speaks about: "${topic}".` : ''}
${userName ? `The user's own name is "${userName}"${userSite ? ` and their website is ${userSite}` : ''}.` : ''}
${rate ? `The user's typical speaking fee is: "${rate}".` : ''}
${profileContext ? `About the user (from their profile):\n${profileContext}` : ''}
Preferred speaking format: ${speakingFormatLabel(format)}.

Find and report, citing your sources:
1. For EACH admired speaker, AT LEAST TWO real, documented events / conferences / stages / podcasts / shows they have actually spoken at or appeared on — recent and notable. Give the event name and, when available, the talk title, role, or year. Also do the same, more briefly, for a few OTHER notable speakers working in this same space and tier (peers we may recommend the user follow) and where they have recently spoken.
2. Real, currently-running events, conferences, series, or shows in this same world that book outside speakers — especially ones with an open Call for Speakers (CFP) or a public speaker-application path. Note what the event is and how a speaker gets on it.${userName ? `
3. Where the user "${userName}" has personally spoken before — their own real speaking footprint (events, podcasts, panels)${userSite ? `; their site ${userSite} may list past talks` : ''}, so we can gauge their current level and reach. If you cannot confidently find this specific person, say so plainly rather than guessing; do not confuse them with a more famous person of a similar name.` : ''}

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
${userName ? `The speaker's own name is "${userName}" — the WEB FINDINGS above may include where THEY have personally spoken. Use that footprint (and their fee) to judge their CURRENT level and reach. The admired speakers are aspirations, NOT the speaker's current level.` : ''}
${rate ? `The speaker's typical fee is "${rate}" — a signal of their tier.` : ''}
${profileContext ? `The speaker's profile (from onboarding):\n${profileContext}` : ''}
Preferred speaking format: ${speakingFormatLabel(format)}.
${groundingBlock}
Do four things:
1. For EACH speaker the user admires (${speakers.map((s) => `"${s}"`).join(', ')}), list AT LEAST TWO (aim for 2–4) notable, REAL events / conferences / stages / podcasts / platforms where that specific speaker has genuinely and publicly appeared. These are the events those speakers actually speak at — their real footprint — not events you are recommending. ${findings.text ? 'Base these strictly on the WEB FINDINGS above and attach a matching "sourceUrl" where one supports the appearance.' : 'Only include appearances you are reasonably confident are real and publicly documented; if you genuinely cannot find two for a speaker, include what you can rather than guessing.'} For each appearance give a short note (talk title, role, or year) only when you actually know it — otherwise leave the note empty. Do NOT fabricate appearances, dates, or talk titles.
2. Recommend 4–6 real speakers TO FOLLOW who work in this same topic world but are at a SIMILAR level of popularity and reach to the speaker themselves — realistic peers and role models roughly one step ahead, NOT the megastars they admire (do not just re-list famous household names). Calibrate to the speaker's current level from their footprint and fee: if they are early-stage, suggest rising/mid-tier speakers, not global A-listers. For each, one line on what they're known for and one line on why they're a good peer to follow and learn from at this stage. ALSO, for these peers, include the REAL events where they have spoken so that ACROSS all the recommended peers there are AT LEAST 5 events in total (they need not be spread evenly — some peers may have more than others). ${findings.text ? 'Prefer events supported by the WEB FINDINGS above and attach a matching "sourceUrl"; leave "sourceUrl" empty when you have no supporting source.' : 'Only include events you are reasonably confident are real.'} Do NOT fabricate these events.
3. Find 5–8 real EVENTS, conferences, series, or shows the speaker could REALISTICALLY land right now — stages within their current ability and appropriate for their fee, not aspirational stages far above their level. ${findings.text ? 'Prefer the events surfaced in the WEB FINDINGS above and attach a matching "sourceUrl" where one supports the event.' : 'Prefer real, well-known event series and communities over invented names.'} For each event give: its typical audience, why it fits THIS speaker at their level, which admired/similar speakers are genuinely associated with that world (only names you're confident belong there — do not fabricate specific appearances), a concrete talk/topic ANGLE this speaker could pitch, and practical guidance on HOW to approach it (e.g. look for its Call for Speakers / CFP page, apply through its speaker form, or contact the organizer/programming team — be specific about the realistic path).
4. Write one short, adaptable OUTREACH email the speaker could send to an event organizer to propose themselves — warm, specific, and easy to personalize.

Be honest and practical. If you are not certain an event still runs or accepts pitches, phrase the "howToApproach" so the speaker verifies it themselves. Never invent contact emails or URLs — only use URLs from the SOURCE URLS list above.

Respond with ONLY valid JSON in this exact shape:
{
  "summary": "one or two sentences on where this speaker fits and the opportunity",
  "speakerAppearances": [{ "speaker": "the admired speaker's name", "events": [{ "name": "...", "format": "e.g. Annual conference / Podcast / Corporate keynote", "note": "talk title, role, or year if known — else empty string", "sourceUrl": "a matching URL from the SOURCE URLS list, or empty string" }] }],
  "similarSpeakers": [{ "name": "...", "knownFor": "one line", "whySimilar": "one line", "events": [{ "name": "...", "format": "e.g. Annual conference / Podcast", "note": "talk title, role, or year if known — else empty string", "sourceUrl": "a matching URL from the SOURCE URLS list, or empty string" }] }],
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
      // Sized for the fuller report (2+ appearances per admired speaker, peer
      // events, recommended events) so the JSON doesn't truncate and fail to parse.
      max_tokens: 4500,
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
