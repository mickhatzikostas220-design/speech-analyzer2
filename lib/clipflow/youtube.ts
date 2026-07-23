import type { TranscriptCue } from './types';

// YouTube Data API v3 + transcript helpers.
//
// Metadata uses the official Data API v3 (requires YOUTUBE_API_KEY). Transcript
// fetching uses YouTube's public timedtext tracks, which need no key but are
// best-effort — if a video has no captions the pipeline degrades gracefully.

const API = 'https://www.googleapis.com/youtube/v3';

export interface ParsedSource {
  type: 'video' | 'channel';
  videoId?: string;
  channelId?: string;
  handle?: string;
  username?: string;
  raw: string;
}

export interface VideoMeta {
  videoId: string;
  title: string;
  description: string;
  channelTitle: string;
  durationSeconds: number;
  thumbnailUrl: string;
}

export class YouTubeError extends Error {}

function apiKey(): string {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    throw new YouTubeError(
      'YouTube is not configured. Set YOUTUBE_API_KEY to enable channel and video lookups.'
    );
  }
  return key;
}

// A YouTube video id is always exactly 11 chars of this alphabet. Enforcing it
// here means the id we later interpolate into the yt-dlp shell command (see
// lib/clipflow/clipper.ts) can never carry shell metacharacters — closes off
// command injection at the source rather than relying on downstream gates.
const YT_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
function asVideoId(id: string | undefined, raw: string): ParsedSource {
  if (id && YT_VIDEO_ID.test(id)) return { type: 'video', videoId: id, raw };
  throw new YouTubeError(
    'Unrecognized YouTube video link. Paste a standard video URL (youtube.com/watch?v=…).'
  );
}

/** Parse a YouTube channel or video URL into its component identifiers. */
export function parseSourceUrl(input: string): ParsedSource {
  const raw = input.trim();
  let url: URL;
  try {
    url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
  } catch {
    throw new YouTubeError('That does not look like a valid URL.');
  }

  const host = url.hostname.replace(/^www\./, '');
  const path = url.pathname;

  // youtu.be/<id>
  if (host === 'youtu.be') {
    const id = path.slice(1).split('/')[0];
    if (id) return asVideoId(id, raw);
  }

  if (host.endsWith('youtube.com')) {
    // watch?v=<id>
    const v = url.searchParams.get('v');
    if (v) return asVideoId(v, raw);

    // /shorts/<id>, /embed/<id>, /v/<id>
    const m = path.match(/^\/(shorts|embed|v)\/([^/?]+)/);
    if (m) return asVideoId(m[2], raw);

    // /channel/<UC...>
    const ch = path.match(/^\/channel\/([^/?]+)/);
    if (ch) return { type: 'channel', channelId: ch[1], raw };

    // /@handle
    const handle = path.match(/^\/@([^/?]+)/);
    if (handle) return { type: 'channel', handle: `@${handle[1]}`, raw };

    // /user/<name> or /c/<name>
    const user = path.match(/^\/(user|c)\/([^/?]+)/);
    if (user) return { type: 'channel', username: user[2], raw };
  }

  throw new YouTubeError(
    'Unrecognized YouTube URL. Paste a video link (youtube.com/watch?v=…) or a channel link (youtube.com/@handle).'
  );
}

function parseISODuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  const [, h, min, s] = m;
  return (Number(h) || 0) * 3600 + (Number(min) || 0) * 60 + (Number(s) || 0);
}

async function ytFetch(path: string, params: Record<string, string>) {
  const qs = new URLSearchParams({ ...params, key: apiKey() }).toString();
  const res = await fetch(`${API}/${path}?${qs}`);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    let message = `YouTube API error (${res.status})`;
    try {
      const parsed = JSON.parse(body);
      message = parsed?.error?.message || message;
    } catch {
      /* keep default */
    }
    throw new YouTubeError(message);
  }
  return res.json();
}

/** Fetch metadata for a single video. */
export async function getVideoMeta(videoId: string): Promise<VideoMeta> {
  const data = await ytFetch('videos', {
    part: 'snippet,contentDetails',
    id: videoId,
  });
  const item = data.items?.[0];
  if (!item) throw new YouTubeError('Video not found or is private.');

  const sn = item.snippet ?? {};
  const thumbs = sn.thumbnails ?? {};
  const thumb = thumbs.maxres || thumbs.high || thumbs.medium || thumbs.default;

  return {
    videoId,
    title: sn.title ?? 'Untitled video',
    description: sn.description ?? '',
    channelTitle: sn.channelTitle ?? '',
    durationSeconds: parseISODuration(item.contentDetails?.duration ?? 'PT0S'),
    thumbnailUrl: thumb?.url ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  };
}

/** Resolve a channel reference to its "uploads" playlist's most recent videos. */
export async function getChannelRecentVideos(
  source: ParsedSource,
  max = 5
): Promise<string[]> {
  let channelId = source.channelId;

  if (!channelId) {
    const params: Record<string, string> = { part: 'id' };
    if (source.handle) params.forHandle = source.handle;
    else if (source.username) params.forUsername = source.username;

    if (params.forHandle || params.forUsername) {
      const data = await ytFetch('channels', params);
      channelId = data.items?.[0]?.id;
    }

    // Fall back to search for /c/<name> style URLs.
    if (!channelId) {
      const q = source.handle?.replace('@', '') || source.username || '';
      const search = await ytFetch('search', {
        part: 'snippet',
        type: 'channel',
        q,
        maxResults: '1',
      });
      channelId = search.items?.[0]?.snippet?.channelId || search.items?.[0]?.id?.channelId;
    }
  }

  if (!channelId) throw new YouTubeError('Could not resolve that channel.');

  const channel = await ytFetch('channels', {
    part: 'contentDetails',
    id: channelId,
  });
  const uploads =
    channel.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) throw new YouTubeError('Channel has no public uploads.');

  const playlist = await ytFetch('playlistItems', {
    part: 'contentDetails',
    playlistId: uploads,
    maxResults: String(Math.min(max, 50)),
  });

  return (playlist.items ?? [])
    .map((it: { contentDetails?: { videoId?: string } }) => it.contentDetails?.videoId)
    .filter((id: string | undefined): id is string => Boolean(id));
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\n+/g, ' ')
    .trim();
}

function parseTimedTextXml(xml: string): TranscriptCue[] {
  const cues: TranscriptCue[] = [];
  const re = /<text start="([\d.]+)"(?: dur="([\d.]+)")?[^>]*>([\s\S]*?)<\/text>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const start = parseFloat(m[1]);
    const dur = m[2] ? parseFloat(m[2]) : 3;
    const text = decodeEntities(m[3].replace(/<[^>]+>/g, ''));
    if (text) cues.push({ start, end: start + dur, text });
  }
  return cues;
}

/**
 * Best-effort transcript fetch via YouTube's public timedtext tracks.
 * Returns null (rather than throwing) when no captions are available so the
 * pipeline can fall back to metadata-only clip suggestions.
 */
export async function getTranscript(videoId: string): Promise<TranscriptCue[] | null> {
  const tryUrl = async (url: string): Promise<TranscriptCue[] | null> => {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ClipFlow/1.0)' },
      });
      if (!res.ok) return null;
      const body = await res.text();
      if (!body.trim()) return null;
      const cues = parseTimedTextXml(body);
      return cues.length ? cues : null;
    } catch {
      return null;
    }
  };

  // 1) Direct timedtext endpoints (work for many videos with public captions).
  const direct =
    (await tryUrl(`https://www.youtube.com/api/timedtext?lang=en&v=${videoId}`)) ||
    (await tryUrl(`https://video.google.com/timedtext?lang=en&v=${videoId}`));
  if (direct) return direct;

  // 2) Extract a caption track baseUrl from the watch page.
  try {
    const page = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ClipFlow/1.0)' },
    });
    const html = await page.text();
    const match = html.match(/"captionTracks":(\[.*?\])/);
    if (match) {
      const tracks = JSON.parse(match[1].replace(/\\u0026/g, '&')) as {
        baseUrl: string;
        languageCode: string;
      }[];
      const track =
        tracks.find((t) => t.languageCode?.startsWith('en')) || tracks[0];
      if (track?.baseUrl) {
        return await tryUrl(track.baseUrl);
      }
    }
  } catch {
    /* ignore */
  }

  return null;
}

/** Compact a cue list into plain text within a [start, end] window. */
export function transcriptWindowText(
  cues: TranscriptCue[],
  start: number,
  end: number
): string {
  return cues
    .filter((c) => c.end > start && c.start < end)
    .map((c) => c.text)
    .join(' ')
    .trim();
}
