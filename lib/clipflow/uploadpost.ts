import type { Platform } from './types';
import { PLATFORM_LABELS } from './types';

// Upload-Post publishing provider for ClipFlow.
//
// Upload-Post (https://upload-post.com) is a universal social publishing API.
// Each ClipFlow user brings their OWN Upload-Post API key
// (https://app.upload-post.com/api-keys) so clips post to THEIR OWN connected
// social accounts. (An app-level UPLOAD_POST_API_KEY can still act as a shared
// fallback — see uploadpost-store.ts, which resolves the key for a user.) Under
// an account each social bundle is a "profile"; publishing names the profile +
// target platforms and Upload-Post posts to that profile's connected accounts.
//
// API: https://docs.upload-post.com
//   Auth: Authorization: Apikey <key>     Base: https://api.upload-post.com
//   POST /api/upload                       multipart: user, platform[], title, video
//   GET  /api/uploadposts/users            list profiles + connected accounts
//   POST /api/uploadposts/users            create a profile { username }
//   POST /api/uploadposts/users/generate-jwt  hosted connect link
//   DELETE /api/uploadposts/users          remove a profile { username }
//
// Every function takes the API key explicitly; the key never reaches the browser
// and is never stored here. Response shapes for the user-management endpoints are
// parsed defensively and Upload-Post errors are surfaced verbatim.

export class UploadPostError extends Error {}

const DEFAULT_API_URL = 'https://api.upload-post.com';

// ClipFlow platform -> Upload-Post platform identifier.
const PLATFORM_ID: Record<Platform, string> = {
  instagram: 'instagram',
  tiktok: 'tiktok',
  youtube: 'youtube',
  twitter: 'x',
};

export const SUPPORTED_IDS = ['tiktok', 'instagram', 'youtube', 'x'];

function platformForId(id: string): Platform | null {
  switch ((id || '').toLowerCase()) {
    case 'instagram':
      return 'instagram';
    case 'tiktok':
      return 'tiktok';
    case 'youtube':
      return 'youtube';
    case 'x':
    case 'twitter':
      return 'twitter';
    default:
      return null;
  }
}

function baseUrl(): string {
  return (process.env.UPLOAD_POST_API_URL || DEFAULT_API_URL).replace(/\/$/, '');
}

function authHeaders(apiKey: string): Record<string, string> {
  if (!apiKey) throw new UploadPostError('Missing Upload-Post API key.');
  return { Authorization: `Apikey ${apiKey}` };
}

// ── Profiles + connection status ────────────────────────────────────────────
// The profile list is per Upload-Post account, so cache it briefly per API key to
// avoid hammering the API on every page load.

interface RawProfile {
  username: string;
  connected: Platform[];
  names: Partial<Record<Platform, string>>;
}

const profilesCache = new Map<string, { at: number; promise: Promise<RawProfile[]> }>();
const PROFILES_TTL_MS = 30_000;

function listProfiles(apiKey: string, force = false): Promise<RawProfile[]> {
  const cached = profilesCache.get(apiKey);
  if (!force && cached && Date.now() - cached.at < PROFILES_TTL_MS) return cached.promise;
  const promise = fetchProfiles(apiKey);
  profilesCache.set(apiKey, { at: Date.now(), promise });
  promise.catch(() => {
    if (profilesCache.get(apiKey)?.promise === promise) profilesCache.delete(apiKey);
  });
  return promise;
}

async function fetchProfiles(apiKey: string): Promise<RawProfile[]> {
  const res = await fetch(`${baseUrl()}/api/uploadposts/users`, { headers: authHeaders(apiKey) });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new UploadPostError(`Upload-Post profiles request failed (${res.status}): ${stringify(data)}`);
  }

  const rec = (data ?? {}) as Record<string, unknown>;
  const raw: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray(rec.profiles)
    ? (rec.profiles as unknown[])
    : Array.isArray(rec.users)
    ? (rec.users as unknown[])
    : [];

  return raw.map((item) => parseProfile(item as Record<string, unknown>));
}

function parseProfile(p: Record<string, unknown>): RawProfile {
  const username = String(p.username ?? p.user ?? p.name ?? '');
  const connected: Platform[] = [];
  const names: Partial<Record<Platform, string>> = {};

  // Connected accounts can appear under a few keys, as an object keyed by
  // platform or an array of account descriptors.
  const accounts =
    (p.social_accounts as unknown) ??
    (p.accounts as unknown) ??
    (p.platforms as unknown) ??
    (p.connected as unknown) ??
    {};

  const add = (id: string, display?: unknown) => {
    const platform = platformForId(id);
    if (!platform || connected.includes(platform)) return;
    connected.push(platform);
    if (typeof display === 'string' && display) names[platform] = display;
  };

  if (Array.isArray(accounts)) {
    accounts.forEach((a) => {
      if (typeof a === 'string') return add(a);
      const acc = a as Record<string, unknown>;
      const id = String(acc.platform ?? acc.provider ?? acc.type ?? '');
      add(id, acc.username ?? acc.display_name ?? acc.name ?? acc.handle);
    });
  } else if (accounts && typeof accounts === 'object') {
    Object.entries(accounts as Record<string, unknown>).forEach(([key, value]) => {
      if (!value) return;
      const v = value as Record<string, unknown>;
      add(key, typeof value === 'object' ? v.username ?? v.display_name ?? v.handle : undefined);
    });
  }

  return { username, connected, names };
}

export interface UploadPostConnection {
  connected: Platform[];
  names: Partial<Record<Platform, string>>;
}

export interface UploadPostProfileSummary {
  username: string;
  connected: Platform[];
}

/** List the profiles (social bundles) under an account. */
export async function listAccountProfiles(
  apiKey: string,
  force = false
): Promise<UploadPostProfileSummary[]> {
  const profiles = await listProfiles(apiKey, force);
  return profiles.map((p) => ({ username: p.username, connected: p.connected }));
}

/** The platforms a given profile has connected in Upload-Post. */
export async function getProfileConnection(
  apiKey: string,
  profile: string,
  force = false
): Promise<UploadPostConnection> {
  const profiles = await listProfiles(apiKey, force);
  const found = profiles.find((p) => p.username === profile);
  return { connected: found?.connected ?? [], names: found?.names ?? {} };
}

/**
 * Validate an API key by listing its profiles. Throws UploadPostError when the
 * key is rejected; returns the account's existing profiles (possibly empty) on
 * success so the caller can adopt one.
 */
export async function validateApiKey(apiKey: string): Promise<UploadPostProfileSummary[]> {
  const profiles = await fetchProfiles(apiKey); // bypass cache — actually hit the API
  return profiles.map((p) => ({ username: p.username, connected: p.connected }));
}

// ── Profile creation + hosted connect link ──────────────────────────────────

/** Create a profile under the account if it doesn't already exist. */
export async function ensureProfile(apiKey: string, username: string): Promise<void> {
  const res = await fetch(`${baseUrl()}/api/uploadposts/users`, {
    method: 'POST',
    headers: { ...authHeaders(apiKey), 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  });
  if (res.ok) {
    profilesCache.delete(apiKey); // a new profile changes the list
    return;
  }
  // Treat "already exists" as success; surface anything else.
  const data = await res.json().catch(() => null);
  const msg = stringify(data).toLowerCase();
  if (res.status === 409 || msg.includes('exist') || msg.includes('already')) return;
  throw new UploadPostError(`Upload-Post profile creation failed (${res.status}): ${stringify(data)}`);
}

/** Generate the hosted link a user opens to connect their social accounts. */
export async function generateConnectLink(
  apiKey: string,
  username: string,
  redirectUrl: string
): Promise<string> {
  await ensureProfile(apiKey, username);
  const res = await fetch(`${baseUrl()}/api/uploadposts/users/generate-jwt`, {
    method: 'POST',
    headers: { ...authHeaders(apiKey), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      redirect_url: redirectUrl,
      platforms: SUPPORTED_IDS,
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new UploadPostError(`Upload-Post connect link failed (${res.status}): ${stringify(data)}`);
  }
  const rec = (data ?? {}) as Record<string, unknown>;
  const url =
    (rec.access_url as string) ??
    (rec.url as string) ??
    (rec.link as string) ??
    ((rec.data as Record<string, unknown>)?.access_url as string);
  if (!url) {
    throw new UploadPostError(`Upload-Post did not return a connect link: ${stringify(data)}`);
  }
  return url;
}

/** Remove a profile (disconnects all of its accounts). Best-effort. */
export async function deleteProfile(apiKey: string, username: string): Promise<void> {
  const res = await fetch(`${baseUrl()}/api/uploadposts/users`, {
    method: 'DELETE',
    headers: { ...authHeaders(apiKey), 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  });
  profilesCache.delete(apiKey);
  if (!res.ok && res.status !== 404) {
    const data = await res.json().catch(() => null);
    throw new UploadPostError(`Upload-Post disconnect failed (${res.status}): ${stringify(data)}`);
  }
}

// ── Publishing ──────────────────────────────────────────────────────────────
// Upload-Post uploads + posts in a single multipart call, so (unlike the
// separate upload/post of some APIs) we re-send the file per platform. We cache
// the downloaded bytes per clip so a "post now to N platforms" burst in one warm
// invocation downloads the clip once.

const bytesCache = new Map<string, { at: number; promise: Promise<Buffer> }>();
const BYTES_TTL_MS = 5 * 60_000;

function clipBytes(cacheKey: string, videoUrl: string): Promise<Buffer> {
  const cached = bytesCache.get(cacheKey);
  if (cached && Date.now() - cached.at < BYTES_TTL_MS) return cached.promise;
  const promise = (async () => {
    const r = await fetch(videoUrl);
    if (!r.ok) throw new UploadPostError('Could not fetch the rendered clip to upload.');
    return Buffer.from(await r.arrayBuffer());
  })();
  pruneBytesCache();
  bytesCache.set(cacheKey, { at: Date.now(), promise });
  promise.catch(() => {
    const cur = bytesCache.get(cacheKey);
    if (cur?.promise === promise) bytesCache.delete(cacheKey);
  });
  return promise;
}

function pruneBytesCache(): void {
  const now = Date.now();
  bytesCache.forEach((v, k) => {
    if (now - v.at >= BYTES_TTL_MS) bytesCache.delete(k);
  });
}

function buildTitle(title: string, description: string, hashtags: string[]): string {
  const tags = hashtags.map((t) => `#${t.replace(/^#/, '')}`).join(' ');
  return [title, description, tags].map((s) => s.trim()).filter(Boolean).join('\n\n');
}

export interface UploadPostPublishInput {
  videoUrl: string;
  cacheKey: string;
  title: string;
  description: string;
  hashtags: string[];
}

export interface UploadPostPublishResult {
  externalId: string | null;
  externalUrl: string | null;
}

/** Publish a rendered clip to one platform through a profile on the given account. */
export async function publishViaUploadPost(
  apiKey: string,
  profile: string,
  platform: Platform,
  input: UploadPostPublishInput
): Promise<UploadPostPublishResult> {
  const buf = await clipBytes(input.cacheKey, input.videoUrl);

  const form = new FormData();
  form.append('user', profile);
  form.append('platform[]', PLATFORM_ID[platform]);
  form.append('title', buildTitle(input.title, input.description, input.hashtags) || 'Clip');
  form.append('video', new Blob([new Uint8Array(buf)], { type: 'video/mp4' }), 'clip.mp4');

  const res = await fetch(`${baseUrl()}/api/upload`, {
    method: 'POST',
    headers: authHeaders(apiKey), // fetch sets the multipart Content-Type + boundary
    body: form,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new UploadPostError(`Upload-Post publish failed (${res.status}): ${stringify(data)}`);
  }

  // A per-platform failure can come back inside a 200 body — surface it.
  const result = extractPlatformResult(data, PLATFORM_ID[platform]);
  if (result.failed) {
    throw new UploadPostError(
      `${PLATFORM_LABELS[platform]} publish was rejected by Upload-Post: ${result.error || stringify(data)}`
    );
  }
  return { externalId: result.id, externalUrl: result.url };
}

function extractPlatformResult(
  data: unknown,
  platformId: string
): { failed: boolean; id: string | null; url: string | null; error: string | null } {
  const rec = (data ?? {}) as Record<string, unknown>;
  if (rec.success === false) {
    return { failed: true, id: null, url: null, error: stringify(rec.error ?? rec.message) };
  }
  const results = (rec.results ?? rec.result ?? {}) as Record<string, unknown>;
  const entry = (results[platformId] ?? {}) as Record<string, unknown>;
  const ok = entry.success === undefined ? true : Boolean(entry.success);
  const url =
    (entry.url as string) ??
    (entry.post_url as string) ??
    (entry.link as string) ??
    (rec.url as string) ??
    null;
  const id = (entry.id as string) ?? (entry.post_id as string) ?? (rec.id as string) ?? null;
  return {
    failed: !ok,
    id: id ? String(id) : null,
    url: url ?? null,
    error: ok ? null : stringify(entry.error ?? entry.message),
  };
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
