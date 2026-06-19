import type { Platform } from './types';

// Platform OAuth + publishing. OAuth credentials live only in server env vars
// and access tokens are stored encrypted (see crypto.ts). Nothing here is ever
// sent to the browser.
//
// Each platform's developer app must be created and its client id/secret set in
// the environment before that platform can be connected. Until then the connect
// flow surfaces a clear "not configured" message rather than failing silently.

export class PlatformError extends Error {}

interface PlatformConfig {
  label: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string;
  // Extra static params for the authorize request.
  authParams?: Record<string, string>;
}

const CONFIG: Record<Platform, PlatformConfig> = {
  youtube: {
    label: 'YouTube',
    clientIdEnv: 'YOUTUBE_OAUTH_CLIENT_ID',
    clientSecretEnv: 'YOUTUBE_OAUTH_CLIENT_SECRET',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: 'https://www.googleapis.com/auth/youtube.upload',
    authParams: { access_type: 'offline', prompt: 'consent' },
  },
  twitter: {
    label: 'X (Twitter)',
    clientIdEnv: 'TWITTER_OAUTH_CLIENT_ID',
    clientSecretEnv: 'TWITTER_OAUTH_CLIENT_SECRET',
    authorizeUrl: 'https://twitter.com/i/oauth2/authorize',
    tokenUrl: 'https://api.twitter.com/2/oauth2/token',
    scopes: 'tweet.read tweet.write users.read offline.access',
    authParams: { code_challenge: 'challenge', code_challenge_method: 'plain' },
  },
  tiktok: {
    label: 'TikTok',
    clientIdEnv: 'TIKTOK_OAUTH_CLIENT_KEY',
    clientSecretEnv: 'TIKTOK_OAUTH_CLIENT_SECRET',
    authorizeUrl: 'https://www.tiktok.com/v2/auth/authorize/',
    tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
    scopes: 'user.info.basic,video.publish,video.upload',
  },
  instagram: {
    label: 'Instagram',
    clientIdEnv: 'INSTAGRAM_OAUTH_CLIENT_ID',
    clientSecretEnv: 'INSTAGRAM_OAUTH_CLIENT_SECRET',
    authorizeUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v19.0/oauth/access_token',
    scopes: 'instagram_basic,instagram_content_publish,pages_show_list',
  },
};

export function platformLabel(platform: Platform): string {
  return CONFIG[platform].label;
}

export function isConfigured(platform: Platform): boolean {
  const c = CONFIG[platform];
  return Boolean(process.env[c.clientIdEnv] && process.env[c.clientSecretEnv]);
}

function appUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL;
  if (!url) throw new PlatformError('NEXT_PUBLIC_APP_URL must be set for OAuth redirects.');
  return url.replace(/\/$/, '');
}

export function redirectUri(platform: Platform): string {
  return `${appUrl()}/api/clipflow/connections/${platform}/callback`;
}

/** Build the OAuth authorize URL the user is redirected to. */
export function getAuthorizeUrl(platform: Platform, state: string): string {
  const c = CONFIG[platform];
  if (!isConfigured(platform)) {
    throw new PlatformError(
      `${c.label} is not configured. Add ${c.clientIdEnv} and ${c.clientSecretEnv} to enable it.`
    );
  }
  const params = new URLSearchParams({
    client_id: process.env[c.clientIdEnv]!,
    redirect_uri: redirectUri(platform),
    response_type: 'code',
    scope: c.scopes,
    state,
    ...(c.authParams ?? {}),
  });
  return `${c.authorizeUrl}?${params.toString()}`;
}

export interface TokenResult {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  accountName: string | null;
  accountId: string | null;
  scopes: string;
}

/** Exchange an authorization code for tokens, then fetch the account name. */
export async function exchangeCodeForTokens(
  platform: Platform,
  code: string
): Promise<TokenResult> {
  const c = CONFIG[platform];
  const clientId = process.env[c.clientIdEnv];
  const clientSecret = process.env[c.clientSecretEnv];
  if (!clientId || !clientSecret) {
    throw new PlatformError(`${c.label} is not configured.`);
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri(platform),
  });
  // TikTok uses client_key rather than client_id.
  if (platform === 'tiktok') {
    body.delete('client_id');
    body.set('client_key', clientId);
    body.set('code_verifier', 'challenge');
  }

  const res = await fetch(c.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new PlatformError(
      `${c.label} token exchange failed: ${data.error_description || data.error || res.status}`
    );
  }

  const accessToken: string = data.access_token;
  const refreshToken: string | null = data.refresh_token ?? null;
  const expiresAt = data.expires_in
    ? new Date(Date.now() + Number(data.expires_in) * 1000).toISOString()
    : null;

  let accountName: string | null = null;
  let accountId: string | null = null;
  try {
    ({ accountName, accountId } = await fetchAccount(platform, accessToken));
  } catch {
    /* account name is best-effort */
  }

  return {
    accessToken,
    refreshToken,
    expiresAt,
    accountName,
    accountId,
    scopes: c.scopes,
  };
}

async function fetchAccount(
  platform: Platform,
  accessToken: string
): Promise<{ accountName: string | null; accountId: string | null }> {
  const auth = { Authorization: `Bearer ${accessToken}` };
  switch (platform) {
    case 'youtube': {
      const r = await fetch(
        'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
        { headers: auth }
      );
      const d = await r.json();
      const ch = d.items?.[0];
      return { accountName: ch?.snippet?.title ?? null, accountId: ch?.id ?? null };
    }
    case 'twitter': {
      const r = await fetch('https://api.twitter.com/2/users/me', { headers: auth });
      const d = await r.json();
      return { accountName: d.data?.username ?? null, accountId: d.data?.id ?? null };
    }
    case 'tiktok': {
      const r = await fetch(
        'https://open.tiktokapis.com/v2/user/info/?fields=display_name,open_id',
        { headers: auth }
      );
      const d = await r.json();
      return {
        accountName: d.data?.user?.display_name ?? null,
        accountId: d.data?.user?.open_id ?? null,
      };
    }
    case 'instagram': {
      const r = await fetch(
        `https://graph.facebook.com/v19.0/me/accounts?access_token=${accessToken}`
      );
      const d = await r.json();
      const page = d.data?.[0];
      return { accountName: page?.name ?? null, accountId: page?.id ?? null };
    }
  }
}

export interface PublishInput {
  accessToken: string;
  accountId: string | null;
  videoUrl: string; // public/signed URL of the rendered vertical clip
  title: string;
  description: string;
  hashtags: string[];
}

export interface PublishResult {
  externalId: string | null;
  externalUrl: string | null;
}

function caption(input: PublishInput): string {
  const tags = input.hashtags.map((t) => `#${t}`).join(' ');
  return [input.title, input.description, tags].filter(Boolean).join('\n\n').trim();
}

/**
 * Publish a rendered clip to a platform. Each branch performs the documented
 * API sequence; platforms whose publishing requires an approved/reviewed app
 * surface a clear, actionable error if the call is rejected.
 */
export async function publishClip(
  platform: Platform,
  input: PublishInput
): Promise<PublishResult> {
  switch (platform) {
    case 'youtube':
      return publishYouTube(input);
    case 'twitter':
      return publishTwitter(input);
    case 'tiktok':
      return publishTikTok(input);
    case 'instagram':
      return publishInstagram(input);
  }
}

async function publishYouTube(input: PublishInput): Promise<PublishResult> {
  // Resumable upload: open a session, then PUT the video bytes.
  const metadata = {
    snippet: {
      title: input.title.slice(0, 100),
      description: caption(input).slice(0, 4900),
      tags: input.hashtags,
    },
    status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
  };
  const init = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': 'video/mp4',
      },
      body: JSON.stringify(metadata),
    }
  );
  if (!init.ok) {
    throw new PlatformError(`YouTube upload init failed: ${await init.text()}`);
  }
  const uploadUrl = init.headers.get('location');
  if (!uploadUrl) throw new PlatformError('YouTube did not return an upload URL.');

  const videoRes = await fetch(input.videoUrl);
  const videoBuf = Buffer.from(await videoRes.arrayBuffer());
  const put = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/mp4' },
    body: videoBuf,
  });
  const data = await put.json().catch(() => ({}));
  if (!put.ok) throw new PlatformError(`YouTube upload failed: ${JSON.stringify(data)}`);
  return {
    externalId: data.id ?? null,
    externalUrl: data.id ? `https://youtube.com/shorts/${data.id}` : null,
  };
}

async function publishTwitter(input: PublishInput): Promise<PublishResult> {
  // v1.1 chunked media upload, then v2 tweet create.
  const videoRes = await fetch(input.videoUrl);
  const videoBuf = Buffer.from(await videoRes.arrayBuffer());
  const auth = { Authorization: `Bearer ${input.accessToken}` };

  const initForm = new URLSearchParams({
    command: 'INIT',
    total_bytes: String(videoBuf.length),
    media_type: 'video/mp4',
    media_category: 'tweet_video',
  });
  const initRes = await fetch('https://upload.twitter.com/1.1/media/upload.json', {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: initForm,
  });
  const initData = await initRes.json().catch(() => ({}));
  if (!initRes.ok) throw new PlatformError(`X media init failed: ${JSON.stringify(initData)}`);
  const mediaId = initData.media_id_string;

  const appendForm = new FormData();
  appendForm.append('command', 'APPEND');
  appendForm.append('media_id', mediaId);
  appendForm.append('segment_index', '0');
  appendForm.append('media', new Blob([videoBuf], { type: 'video/mp4' }));
  await fetch('https://upload.twitter.com/1.1/media/upload.json', {
    method: 'POST',
    headers: auth,
    body: appendForm,
  });

  await fetch('https://upload.twitter.com/1.1/media/upload.json', {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ command: 'FINALIZE', media_id: mediaId }),
  });

  const tweet = await fetch('https://api.twitter.com/2/tweets', {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: caption(input).slice(0, 280), media: { media_ids: [mediaId] } }),
  });
  const data = await tweet.json().catch(() => ({}));
  if (!tweet.ok) throw new PlatformError(`X post failed: ${JSON.stringify(data)}`);
  return {
    externalId: data.data?.id ?? null,
    externalUrl: data.data?.id ? `https://x.com/i/status/${data.data.id}` : null,
  };
}

async function publishTikTok(input: PublishInput): Promise<PublishResult> {
  // Content Posting API — pull-from-URL flow (requires an approved app).
  const res = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({
      post_info: { title: caption(input).slice(0, 2200), privacy_level: 'SELF_ONLY' },
      source_info: { source: 'PULL_FROM_URL', video_url: input.videoUrl },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error?.code !== 'ok') {
    throw new PlatformError(
      `TikTok publish failed: ${data.error?.message || JSON.stringify(data)}`
    );
  }
  return { externalId: data.data?.publish_id ?? null, externalUrl: null };
}

async function publishInstagram(input: PublishInput): Promise<PublishResult> {
  // Graph API — create a REELS container from a public URL, then publish it.
  if (!input.accountId) {
    throw new PlatformError('Instagram publishing needs a connected Business/Creator account.');
  }
  const create = await fetch(
    `https://graph.facebook.com/v19.0/${input.accountId}/media`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        media_type: 'REELS',
        video_url: input.videoUrl,
        caption: caption(input),
        access_token: input.accessToken,
      }),
    }
  );
  const created = await create.json().catch(() => ({}));
  if (!create.ok || !created.id) {
    throw new PlatformError(`Instagram container failed: ${JSON.stringify(created)}`);
  }
  const publish = await fetch(
    `https://graph.facebook.com/v19.0/${input.accountId}/media_publish`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: created.id, access_token: input.accessToken }),
    }
  );
  const published = await publish.json().catch(() => ({}));
  if (!publish.ok) throw new PlatformError(`Instagram publish failed: ${JSON.stringify(published)}`);
  return {
    externalId: published.id ?? null,
    externalUrl: published.id ? `https://www.instagram.com/reel/${published.id}` : null,
  };
}
