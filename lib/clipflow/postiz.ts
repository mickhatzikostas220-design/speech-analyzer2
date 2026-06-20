import type { Platform } from './types';
import { PLATFORM_LABELS } from './types';

// Postiz publishing provider for ClipFlow.
//
// Postiz (https://postiz.com) is a social-media scheduler that owns the OAuth
// connections to every platform. When POSTIZ_API_KEY is set, ClipFlow publishes
// through the Postiz Public API instead of maintaining a separate OAuth app and
// publishing implementation per platform — you connect your accounts once inside
// Postiz and ClipFlow posts to them.
//
// The same API key powers both this REST integration and the Postiz MCP server.
// Generate it in Postiz → Settings → Public API. Everything here runs
// server-side only; the key never reaches the browser.
//
// Public API reference: https://docs.postiz.com/public-api
//   Auth:    Authorization: <api-key>            (no "Bearer " prefix)
//   Base:    https://api.postiz.com/public/v1    (override for self-hosted)
//   GET  /integrations  -> connected channels
//   POST /upload        -> multipart "file", returns { id, path }
//   POST /posts         -> create/schedule a post

export class PostizError extends Error {}

// ClipFlow platform -> Postiz provider identifier(s). Postiz reports the
// provider in each integration's `identifier`; X is matched as both 'x' and
// the legacy 'twitter'.
const PLATFORM_PROVIDERS: Record<Platform, string[]> = {
  instagram: ['instagram'],
  tiktok: ['tiktok'],
  youtube: ['youtube'],
  twitter: ['x', 'twitter'],
};

export function postizEnabled(): boolean {
  return Boolean(process.env.POSTIZ_API_KEY);
}

/** Link target for the "Manage channels in Postiz" affordance. */
export function postizAppUrl(): string {
  return (process.env.POSTIZ_APP_URL || 'https://app.postiz.com').replace(/\/$/, '');
}

function baseUrl(): string {
  return (process.env.POSTIZ_API_URL || 'https://api.postiz.com/public/v1').replace(/\/$/, '');
}

function authHeaders(): Record<string, string> {
  const key = process.env.POSTIZ_API_KEY;
  if (!key) throw new PostizError('POSTIZ_API_KEY is not set.');
  return { Authorization: key };
}

export interface PostizIntegration {
  id: string;
  name: string;
  identifier: string; // provider, e.g. 'instagram' | 'youtube' | 'tiktok' | 'x'
  picture: string | null;
  disabled: boolean;
}

/** Map a Postiz provider identifier back to a ClipFlow platform, if we model it. */
export function platformForProvider(identifier: string): Platform | null {
  const id = (identifier || '').toLowerCase();
  for (const platform of Object.keys(PLATFORM_PROVIDERS) as Platform[]) {
    if (PLATFORM_PROVIDERS[platform].includes(id)) return platform;
  }
  return null;
}

function integrationForPlatform(
  platform: Platform,
  integrations: PostizIntegration[]
): PostizIntegration | null {
  const providers = PLATFORM_PROVIDERS[platform];
  return (
    integrations.find(
      (i) => !i.disabled && providers.includes((i.identifier || '').toLowerCase())
    ) ?? null
  );
}

// ── Rate-limit-friendly caching ─────────────────────────────────────────────
// The Postiz Public API is capped at ~30 requests/hour, so we cache the channel
// list briefly and de-duplicate the media upload when one clip is posted to
// several platforms at once. The caches hold the in-flight *promise* (not just
// the result) so the concurrent burst the post route fires — one publish call
// per platform in parallel — shares a single integrations fetch and a single
// upload rather than racing into N identical requests.

let integrationsCache: { at: number; promise: Promise<PostizIntegration[]> } | null = null;
const INTEGRATIONS_TTL_MS = 60_000;

interface UploadedMedia {
  id: string;
  path: string;
}

const uploadCache = new Map<string, { at: number; promise: Promise<UploadedMedia> }>();
const UPLOAD_TTL_MS = 5 * 60_000;

/** List the channels connected in the Postiz workspace (cached ~60s). */
export async function listIntegrations(force = false): Promise<PostizIntegration[]> {
  if (!force && integrationsCache && Date.now() - integrationsCache.at < INTEGRATIONS_TTL_MS) {
    return integrationsCache.promise;
  }
  const promise = fetchIntegrations();
  integrationsCache = { at: Date.now(), promise };
  // Drop a failed fetch from the cache so the next call retries.
  promise.catch(() => {
    if (integrationsCache?.promise === promise) integrationsCache = null;
  });
  return promise;
}

async function fetchIntegrations(): Promise<PostizIntegration[]> {
  const res = await fetch(`${baseUrl()}/integrations`, { headers: authHeaders() });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new PostizError(
      `Postiz integrations request failed (${res.status}): ${stringify(data)}`
    );
  }

  // The endpoint has been seen returning either a bare array or { integrations }.
  const raw: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray((data as { integrations?: unknown[] })?.integrations)
    ? (data as { integrations: unknown[] }).integrations
    : [];

  return raw.map((item) => {
    const i = item as Record<string, unknown>;
    return {
      id: String(i.id ?? ''),
      name: String(i.name ?? ''),
      identifier: String(i.identifier ?? i.type ?? i.provider ?? ''),
      picture: (i.picture as string) ?? (i.profile as string) ?? null,
      disabled: Boolean(i.disabled),
    };
  });
}

/** Upload the rendered MP4 to Postiz (de-duplicated per clip across platforms). */
function uploadVideo(cacheKey: string, videoUrl: string): Promise<UploadedMedia> {
  const cached = uploadCache.get(cacheKey);
  if (cached && Date.now() - cached.at < UPLOAD_TTL_MS) return cached.promise;

  const promise = doUploadVideo(videoUrl);
  pruneUploadCache();
  uploadCache.set(cacheKey, { at: Date.now(), promise });
  promise.catch(() => {
    const current = uploadCache.get(cacheKey);
    if (current?.promise === promise) uploadCache.delete(cacheKey);
  });
  return promise;
}

async function doUploadVideo(videoUrl: string): Promise<UploadedMedia> {
  const fileRes = await fetch(videoUrl);
  if (!fileRes.ok) {
    throw new PostizError('Could not fetch the rendered clip to upload to Postiz.');
  }
  const buf = Buffer.from(await fileRes.arrayBuffer());

  const form = new FormData();
  form.append('file', new Blob([buf], { type: 'video/mp4' }), 'clip.mp4');

  const res = await fetch(`${baseUrl()}/upload`, {
    method: 'POST',
    headers: authHeaders(), // let fetch set the multipart Content-Type + boundary
    body: form,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new PostizError(`Postiz upload failed (${res.status}): ${stringify(data)}`);
  }

  const rec = (data ?? {}) as Record<string, unknown>;
  const id = rec.id ? String(rec.id) : '';
  const path = (rec.path as string) ?? (rec.url as string) ?? '';
  if (!id || !path) {
    throw new PostizError(`Postiz upload returned an unexpected response: ${stringify(data)}`);
  }
  return { id, path };
}

function pruneUploadCache(): void {
  const now = Date.now();
  uploadCache.forEach((value, key) => {
    if (now - value.at >= UPLOAD_TTL_MS) uploadCache.delete(key);
  });
}

function buildContent(title: string, description: string, hashtags: string[]): string {
  const tags = hashtags.map((t) => `#${t.replace(/^#/, '')}`).join(' ');
  return [title, description, tags].map((s) => s.trim()).filter(Boolean).join('\n\n');
}

// Per-provider publish settings. `__type` mirrors the channel's own identifier
// so we always send what Postiz reported. We only add the field that is plainly
// required (YouTube needs a title); any other provider-specific defaults
// (e.g. TikTok privacy, IG reel vs. post) are taken from the channel's settings
// in Postiz, and Postiz's own error is surfaced verbatim if something's missing.
function settingsFor(
  integration: PostizIntegration,
  platform: Platform,
  title: string
): Record<string, unknown> {
  const settings: Record<string, unknown> = { __type: integration.identifier };
  if (platform === 'youtube') {
    settings.title = (title || 'Clip').slice(0, 100);
    settings.type = 'public';
  }
  return settings;
}

export interface PostizPublishInput {
  videoUrl: string; // signed URL to fetch the rendered clip bytes
  cacheKey: string; // stable key (the clip's storage path) for upload de-dup
  title: string;
  description: string;
  hashtags: string[];
}

export interface PostizPublishResult {
  externalId: string | null;
  externalUrl: string | null;
}

/**
 * Publish a rendered clip to one platform through Postiz: resolve the channel,
 * upload the media, then create a post that publishes now. ClipFlow's own queue
 * handles scheduling, so this always posts immediately.
 */
export async function publishViaPostiz(
  platform: Platform,
  input: PostizPublishInput
): Promise<PostizPublishResult> {
  const integrations = await listIntegrations();
  const integration = integrationForPlatform(platform, integrations);
  if (!integration) {
    throw new PostizError(
      `No connected ${PLATFORM_LABELS[platform]} channel in Postiz — connect it in Postiz first.`
    );
  }

  const media = await uploadVideo(input.cacheKey, input.videoUrl);
  const content = buildContent(input.title, input.description, input.hashtags);

  const body = {
    type: 'now',
    date: new Date().toISOString(),
    shortLink: false,
    tags: [] as string[],
    posts: [
      {
        integration: { id: integration.id },
        value: [{ content, image: [{ id: media.id, path: media.path }] }],
        settings: settingsFor(integration, platform, input.title),
      },
    ],
  };

  const res = await fetch(`${baseUrl()}/posts`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new PostizError(`Postiz publish failed (${res.status}): ${stringify(data)}`);
  }

  return { externalId: extractPostId(data), externalUrl: null };
}

function extractPostId(data: unknown): string | null {
  if (!data) return null;
  if (Array.isArray(data)) {
    const first = data[0] as { id?: unknown } | undefined;
    return first?.id != null ? String(first.id) : null;
  }
  const rec = data as { id?: unknown; postId?: unknown };
  const id = rec.id ?? rec.postId;
  return id != null ? String(id) : null;
}

function stringify(data: unknown): string {
  if (data == null) return '';
  if (typeof data === 'string') return data;
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}
