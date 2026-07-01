import OpenAI from 'openai';
import { createChatCompletion, hasAiKey } from '@/lib/ai-config';
import type { ClipCandidate, ClipLength, ClipPreferences, PlatformHashtags, TranscriptCue } from './types';

// All ClipFlow text generation runs on GPT-4o via the `openai` SDK. By default
// it reuses the app-wide AI key — OpenRouter when OPENROUTER_API_KEY is set,
// otherwise OPENAI_API_KEY (see lib/ai-config). Callers can also pass a per-user
// `apiKey` (resolved from clipflow_secrets) so each user's clipping is billed to
// their own OpenAI account; that path always talks to OpenAI directly.

// Minimal metadata shape the generator needs (structurally compatible with
// youtube.ts's VideoMeta).
interface VideoMetaLike {
  title: string;
  channelTitle: string;
  description: string;
  durationSeconds: number;
}

export class ClipAIError extends Error {}

function parseJson<T>(raw: string): T {
  let text = raw.trim();
  // Strip ``` / ```json fences if present.
  text = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  // Grab the outermost array or object.
  const firstArr = text.indexOf('[');
  const firstObj = text.indexOf('{');
  const start =
    firstArr === -1 ? firstObj : firstObj === -1 ? firstArr : Math.min(firstArr, firstObj);
  const lastArr = text.lastIndexOf(']');
  const lastObj = text.lastIndexOf('}');
  const end = Math.max(lastArr, lastObj);
  if (start !== -1 && end !== -1) text = text.slice(start, end + 1);
  return JSON.parse(text) as T;
}

async function callJson<T>(
  system: string,
  user: string,
  maxTokens = 3000,
  temperature = 0.7,
  apiKey?: string
): Promise<T> {
  const messages = [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: user },
  ];

  // A per-user (bring-your-own) key always hits OpenAI directly on gpt-4o.
  if (apiKey) {
    const res = await new OpenAI({ apiKey }).chat.completions.create({
      model: 'gpt-4o',
      max_tokens: maxTokens,
      temperature,
      messages,
    });
    return parseJson<T>(res.choices[0]?.message?.content ?? '');
  }

  // Otherwise use the app-wide client (OpenRouter when configured), which
  // automatically fails over to OpenAI if OpenRouter rate-limits or errors.
  if (!hasAiKey()) {
    throw new ClipAIError(
      'AI generation is not configured. Add your OpenAI API key in ClipFlow → API keys (or set OPENROUTER_API_KEY / OPENAI_API_KEY) to enable clipping and captions.'
    );
  }
  const res = await createChatCompletion('gpt-4o', {
    max_tokens: maxTokens,
    temperature,
    messages,
  });
  return parseJson<T>(res.choices[0]?.message?.content ?? '');
}

function fmtTimestampedTranscript(cues: TranscriptCue[]): string {
  return cues
    .map((c) => `[${c.start.toFixed(1)}] ${c.text}`)
    .join('\n');
}

// Hard duration bounds the detector and clamp logic both respect. "any" spans
// the full allowed range; the others narrow the model toward a target length.
const LENGTH_BANDS: Record<ClipLength, { min: number; max: number; label: string }> = {
  any: { min: 15, max: 90, label: '15–90 seconds' },
  short: { min: 15, max: 30, label: '15–30 seconds (snappy and fast-paced)' },
  medium: { min: 30, max: 60, label: '30–60 seconds' },
  long: { min: 60, max: 90, label: '60–90 seconds (room for a fuller story)' },
};

function bandFor(prefs?: ClipPreferences): { min: number; max: number; label: string } {
  return LENGTH_BANDS[prefs?.length ?? 'any'] ?? LENGTH_BANDS.any;
}

// Render the user's preferences as an extra instruction block appended to the
// detection prompt. Returns '' when there's nothing meaningful to add.
function fmtPreferences(prefs?: ClipPreferences): string {
  if (!prefs) return '';
  const lines: string[] = [];
  const band = bandFor(prefs);
  if (prefs.length && prefs.length !== 'any') {
    lines.push(`- Target clip length: ${band.label}. Strongly prefer clips in this range.`);
  }
  const tone = prefs.tone?.trim();
  if (tone) {
    lines.push(`- Desired tone/style: ${tone.slice(0, 200)}. Favour moments that fit this vibe.`);
  }
  const notes = prefs.notes?.trim();
  if (notes) {
    lines.push(`- The user is specifically looking for: ${notes.slice(0, 600)}`);
  }
  if (lines.length === 0) return '';
  return `\n\nUSER PREFERENCES (prioritise these — they describe exactly the clips the user wants):\n${lines.join(
    '\n'
  )}`;
}

interface RawClip {
  start: number;
  end: number;
  title: string;
  caption: string;
  description: string;
  hashtags: PlatformHashtags;
  transcript_text?: string;
  score: number;
  reason: string;
}

const DETECT_SYSTEM = `You are ClipFlow, an expert short-form video editor. You find the highest-value moments in long-form video transcripts and turn them into scroll-stopping vertical clips for Instagram Reels, TikTok, YouTube Shorts, and X.

You look for: strong hooks, key insights, emotional peaks, surprising claims, quotable one-liners, and self-contained stories. Each clip must stand alone without outside context.

Rules for every clip:
- Duration between 15 and 90 seconds. Start on a clean sentence boundary.
- "title": punchy, platform-native, max 60 chars, no hashtags, no quotes around it.
- "caption": the on-screen hook line (max 90 chars) — the spoken essence, not the literal first words.
- "description": 1–2 sentences for the post body.
- "hashtags": an object with keys "default", "instagram", "tiktok", "youtube", "twitter"; each an array of 3–6 lowercase tags WITHOUT the # symbol, tuned to that platform.
- "score": 0–100, how viral/valuable this moment is.
- "reason": one short sentence on why this moment works.

Return ONLY minified JSON: an array of clip objects with keys start, end, title, caption, description, hashtags, score, reason. Timestamps are in seconds.`;

async function detectInWindow(
  meta: VideoMetaLike,
  cues: TranscriptCue[],
  count: number,
  prefs?: ClipPreferences,
  apiKey?: string
): Promise<RawClip[]> {
  const transcript = fmtTimestampedTranscript(cues);
  const user = `Video title: ${meta.title}
Channel: ${meta.channelTitle}

Transcript (timestamps in seconds at the start of each line):
${transcript}

Find the ${count} best short-form clips in this section. Return the JSON array only.${fmtPreferences(
    prefs
  )}`;

  const clips = await callJson<RawClip[]>(DETECT_SYSTEM, user, 3500, 0.7, apiKey);
  return Array.isArray(clips) ? clips : [];
}

// Propose clips when no transcript is available — purely from metadata + duration.
async function detectFromMetadata(
  meta: VideoMetaLike,
  count: number,
  prefs?: ClipPreferences,
  apiKey?: string
): Promise<RawClip[]> {
  const band = bandFor(prefs);
  const system = `You are ClipFlow. No transcript is available, so propose ${count} plausible short-form clip windows spread across a ${Math.round(
    meta.durationSeconds
  )}-second video, based on its title and description. Same JSON contract as usual (start, end, title, caption, description, hashtags{default,instagram,tiktok,youtube,twitter}, score, reason). Each clip ${
    band.label
  }, within the video duration. Return ONLY the JSON array.`;
  const user = `Title: ${meta.title}
Channel: ${meta.channelTitle}
Duration: ${Math.round(meta.durationSeconds)}s
Description: ${meta.description.slice(0, 1500)}${fmtPreferences(prefs)}`;
  const clips = await callJson<RawClip[]>(system, user, 2500, 0.8, apiKey);
  return Array.isArray(clips) ? clips : [];
}

function normalizeHashtags(h: PlatformHashtags | undefined): PlatformHashtags {
  const clean = (arr?: string[]) =>
    (arr ?? []).map((t) => t.replace(/^#/, '').trim()).filter(Boolean).slice(0, 6);
  return {
    default: clean(h?.default),
    instagram: clean(h?.instagram),
    tiktok: clean(h?.tiktok),
    youtube: clean(h?.youtube),
    twitter: clean(h?.twitter),
  };
}

function overlaps(a: RawClip, b: RawClip): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Detect 3–10 high-value clips across an entire video. Long videos are split
 * into a bounded number of windows so the number of model calls (and total
 * latency) never grows without limit, no matter the runtime.
 */
export async function detectClips(
  meta: VideoMetaLike,
  cues: TranscriptCue[] | null,
  opts: { maxClips?: number; preferences?: ClipPreferences; apiKey?: string } = {}
): Promise<ClipCandidate[]> {
  const maxClips = Math.min(10, Math.max(3, opts.maxClips ?? 6));
  const prefs = opts.preferences;
  const apiKey = opts.apiKey;
  const band = bandFor(prefs);

  let raw: RawClip[] = [];

  if (!cues || cues.length === 0) {
    raw = await detectFromMetadata(meta, maxClips, prefs, apiKey);
  } else {
    const MAX_WINDOWS = 6;
    const duration = meta.durationSeconds || cues[cues.length - 1].end;
    const windowCount = Math.min(MAX_WINDOWS, Math.max(1, Math.ceil(duration / 600)));
    const windowSize = duration / windowCount;
    const perWindow = Math.max(2, Math.ceil(maxClips / windowCount) + 1);

    const windows = Array.from({ length: windowCount }, (_, i) => {
      const start = i * windowSize;
      const end = (i + 1) * windowSize;
      return cues.filter((c) => c.end > start && c.start < end);
    }).filter((w) => w.length > 0);

    // Bounded concurrency so we stay fast without hammering the API.
    const CONCURRENCY = 3;
    for (let i = 0; i < windows.length; i += CONCURRENCY) {
      const batch = windows.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map((w) => detectInWindow(meta, w, perWindow, prefs, apiKey).catch(() => []))
      );
      raw.push(...results.flat());
    }
  }

  // Clamp durations, sort by score, then drop overlaps greedily.
  const cleaned = raw
    .map((c) => {
      const start = Math.max(0, Number(c.start) || 0);
      let end = Number(c.end) || start + band.min;
      const len = end - start;
      if (len < band.min) end = start + band.min;
      if (len > band.max) end = start + band.max;
      return { ...c, start, end, score: Number(c.score) || 50 };
    })
    .filter((c) => c.end > c.start)
    .sort((a, b) => b.score - a.score);

  const selected: RawClip[] = [];
  for (const clip of cleaned) {
    if (selected.length >= maxClips) break;
    if (selected.some((s) => overlaps(s, clip))) continue;
    selected.push(clip);
  }

  // Ensure we return at least a few even if everything overlapped.
  const final = selected.length >= 3 ? selected : cleaned.slice(0, maxClips);

  return final
    .sort((a, b) => a.start - b.start)
    .map((c) => ({
      start: c.start,
      end: c.end,
      title: (c.title || 'Untitled clip').slice(0, 80),
      caption: (c.caption || c.title || '').slice(0, 120),
      description: c.description || '',
      hashtags: normalizeHashtags(c.hashtags),
      transcript_text: c.transcript_text || '',
      score: Math.round(c.score),
      reason: c.reason || '',
    }));
}

/** Regenerate the copy (title/caption/description/hashtags) for a single clip. */
export async function generateClipCopy(input: {
  videoTitle: string;
  transcriptText: string;
  apiKey?: string;
}): Promise<Pick<ClipCandidate, 'title' | 'caption' | 'description' | 'hashtags'>> {
  const system = `You are ClipFlow, a short-form copywriter. Given a clip's transcript, write platform-native copy. Return ONLY minified JSON with keys: title (<=60 chars), caption (<=90 chars on-screen hook), description (1-2 sentences), hashtags (object with default, instagram, tiktok, youtube, twitter arrays of 3-6 lowercase tags without #).`;
  const user = `Source video: ${input.videoTitle}

Clip transcript:
${input.transcriptText.slice(0, 4000)}`;

  const out = await callJson<{
    title: string;
    caption: string;
    description: string;
    hashtags: PlatformHashtags;
  }>(system, user, 1200, 0.8, input.apiKey);

  return {
    title: (out.title || 'Untitled clip').slice(0, 80),
    caption: (out.caption || '').slice(0, 120),
    description: out.description || '',
    hashtags: normalizeHashtags(out.hashtags),
  };
}
