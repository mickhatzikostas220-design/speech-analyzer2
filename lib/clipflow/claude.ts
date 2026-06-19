import Anthropic from '@anthropic-ai/sdk';
import type { ClipCandidate, PlatformHashtags, TranscriptCue } from './types';

// All ClipFlow text generation runs on Claude (claude-sonnet-4-6) via the
// Anthropic SDK that already ships with this project.

const MODEL = 'claude-sonnet-4-6';

// Minimal metadata shape the generator needs (structurally compatible with
// youtube.ts's VideoMeta).
interface VideoMetaLike {
  title: string;
  channelTitle: string;
  description: string;
  durationSeconds: number;
}

export class ClaudeError extends Error {}

function client(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ClaudeError(
      'AI generation is not configured. Set ANTHROPIC_API_KEY to enable clipping and captions.'
    );
  }
  return new Anthropic({ apiKey });
}

function extractText(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

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

async function callJson<T>(system: string, user: string, maxTokens = 3000, temperature = 0.7): Promise<T> {
  const msg = await client().messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    temperature,
    system,
    messages: [{ role: 'user', content: user }],
  });
  return parseJson<T>(extractText(msg));
}

function fmtTimestampedTranscript(cues: TranscriptCue[]): string {
  return cues
    .map((c) => `[${c.start.toFixed(1)}] ${c.text}`)
    .join('\n');
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
  count: number
): Promise<RawClip[]> {
  const transcript = fmtTimestampedTranscript(cues);
  const user = `Video title: ${meta.title}
Channel: ${meta.channelTitle}

Transcript (timestamps in seconds at the start of each line):
${transcript}

Find the ${count} best short-form clips in this section. Return the JSON array only.`;

  const clips = await callJson<RawClip[]>(DETECT_SYSTEM, user, 3500, 0.7);
  return Array.isArray(clips) ? clips : [];
}

// Propose clips when no transcript is available — purely from metadata + duration.
async function detectFromMetadata(meta: VideoMetaLike, count: number): Promise<RawClip[]> {
  const system = `You are ClipFlow. No transcript is available, so propose ${count} plausible short-form clip windows spread across a ${Math.round(
    meta.durationSeconds
  )}-second video, based on its title and description. Same JSON contract as usual (start, end, title, caption, description, hashtags{default,instagram,tiktok,youtube,twitter}, score, reason). Each clip 20–60s, within the video duration. Return ONLY the JSON array.`;
  const user = `Title: ${meta.title}
Channel: ${meta.channelTitle}
Duration: ${Math.round(meta.durationSeconds)}s
Description: ${meta.description.slice(0, 1500)}`;
  const clips = await callJson<RawClip[]>(system, user, 2500, 0.8);
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
 * into a bounded number of windows so the number of Claude calls (and total
 * latency) never grows without limit, no matter the runtime.
 */
export async function detectClips(
  meta: VideoMetaLike,
  cues: TranscriptCue[] | null,
  opts: { maxClips?: number } = {}
): Promise<ClipCandidate[]> {
  const maxClips = Math.min(10, Math.max(3, opts.maxClips ?? 6));

  let raw: RawClip[] = [];

  if (!cues || cues.length === 0) {
    raw = await detectFromMetadata(meta, maxClips);
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
        batch.map((w) => detectInWindow(meta, w, perWindow).catch(() => []))
      );
      raw.push(...results.flat());
    }
  }

  // Clamp durations, sort by score, then drop overlaps greedily.
  const cleaned = raw
    .map((c) => {
      const start = Math.max(0, Number(c.start) || 0);
      let end = Number(c.end) || start + 30;
      const len = end - start;
      if (len < 15) end = start + 15;
      if (len > 90) end = start + 90;
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
  }>(system, user, 1200, 0.8);

  return {
    title: (out.title || 'Untitled clip').slice(0, 80),
    caption: (out.caption || '').slice(0, 120),
    description: out.description || '',
    hashtags: normalizeHashtags(out.hashtags),
  };
}
