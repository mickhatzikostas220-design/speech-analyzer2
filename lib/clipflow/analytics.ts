import type { Platform } from './types';
import { platformLabel } from './platforms';

// Read-only social analytics. Reuses the OAuth access tokens already stored for
// ClipFlow publishing (see platforms.ts / crypto.ts) to pull follower counts,
// views, and engagement from each connected platform.
//
// Tokens are decrypted by the caller and passed in here; this module only ever
// makes outbound read requests and never persists or returns the token. Some
// platforms (TikTok, Instagram) gate richer stats behind extra OAuth scopes or
// an approved app — when a call is rejected we attach a clear `note` instead of
// throwing, so the agent can still report what it could read.

export interface SocialAnalytics {
  platform: Platform;
  label: string;
  accountName: string | null;
  // Normalized, human-readable metric label -> value.
  metrics: Record<string, number | string>;
  // Up to a handful of recent items with their own stats (e.g. videos).
  recent?: { title: string; metrics: Record<string, number | string> }[];
  // Caveats: missing scopes, partial data, etc.
  note?: string;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export async function fetchSocialAnalytics(
  platform: Platform,
  accessToken: string,
  accountId: string | null
): Promise<SocialAnalytics> {
  switch (platform) {
    case 'youtube':
      return fetchYouTube(accessToken);
    case 'twitter':
      return fetchTwitter(accessToken);
    case 'tiktok':
      return fetchTikTok(accessToken);
    case 'instagram':
      return fetchInstagram(accessToken, accountId);
  }
}

async function fetchYouTube(token: string): Promise<SocialAnalytics> {
  const auth = { Authorization: `Bearer ${token}` };
  const base: SocialAnalytics = {
    platform: 'youtube',
    label: platformLabel('youtube'),
    accountName: null,
    metrics: {},
  };

  const chRes = await fetch(
    'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&mine=true',
    { headers: auth }
  );
  const chData = await chRes.json().catch(() => ({}));
  if (!chRes.ok) {
    base.note = `Could not read YouTube channel stats: ${chData?.error?.message || chRes.status}.`;
    return base;
  }
  const ch = chData.items?.[0];
  if (!ch) {
    base.note = 'No YouTube channel found for this account.';
    return base;
  }
  base.accountName = ch.snippet?.title ?? null;
  const s = ch.statistics ?? {};
  base.metrics = {
    Subscribers: num(s.subscriberCount),
    'Total views': num(s.viewCount),
    Videos: num(s.videoCount),
  };

  // Recent uploads with per-video view/like counts.
  const uploads = ch.contentDetails?.relatedPlaylists?.uploads as string | undefined;
  if (uploads) {
    try {
      const plRes = await fetch(
        `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=5&playlistId=${uploads}`,
        { headers: auth }
      );
      const plData = await plRes.json().catch(() => ({}));
      const ids = (plData.items ?? [])
        .map((i: { contentDetails?: { videoId?: string } }) => i.contentDetails?.videoId)
        .filter(Boolean)
        .join(',');
      if (ids) {
        const vRes = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${ids}`,
          { headers: auth }
        );
        const vData = await vRes.json().catch(() => ({}));
        base.recent = (vData.items ?? []).map(
          (v: { snippet?: { title?: string }; statistics?: Record<string, string> }) => ({
            title: v.snippet?.title ?? 'Untitled',
            metrics: {
              Views: num(v.statistics?.viewCount),
              Likes: num(v.statistics?.likeCount),
              Comments: num(v.statistics?.commentCount),
            },
          })
        );
      }
    } catch {
      /* recent videos are best-effort */
    }
  }
  return base;
}

async function fetchTwitter(token: string): Promise<SocialAnalytics> {
  const base: SocialAnalytics = {
    platform: 'twitter',
    label: platformLabel('twitter'),
    accountName: null,
    metrics: {},
  };
  const res = await fetch(
    'https://api.twitter.com/2/users/me?user.fields=public_metrics,username',
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    base.note = `Could not read X analytics: ${data?.title || data?.detail || res.status}. Per-post impressions need a paid X API tier.`;
    return base;
  }
  base.accountName = data.data?.username ? `@${data.data.username}` : null;
  const m = data.data?.public_metrics ?? {};
  base.metrics = {
    Followers: num(m.followers_count),
    Following: num(m.following_count),
    Posts: num(m.tweet_count),
    Listed: num(m.listed_count),
  };
  base.note = 'Per-post impressions/engagement require an elevated (paid) X API tier.';
  return base;
}

async function fetchTikTok(token: string): Promise<SocialAnalytics> {
  const base: SocialAnalytics = {
    platform: 'tiktok',
    label: platformLabel('tiktok'),
    accountName: null,
    metrics: {},
  };
  const res = await fetch(
    'https://open.tiktokapis.com/v2/user/info/?fields=display_name,follower_count,following_count,likes_count,video_count',
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json().catch(() => ({}));
  const user = data?.data?.user;
  if (!res.ok || data?.error?.code !== 'ok' || !user) {
    base.note = `Could not read TikTok analytics: ${data?.error?.message || res.status}. Account-level stats need the user.info.stats scope granted at connect time.`;
    return base;
  }
  base.accountName = user.display_name ?? null;
  base.metrics = {
    Followers: num(user.follower_count),
    Following: num(user.following_count),
    'Total likes': num(user.likes_count),
    Videos: num(user.video_count),
  };
  return base;
}

async function fetchInstagram(token: string, accountId: string | null): Promise<SocialAnalytics> {
  const base: SocialAnalytics = {
    platform: 'instagram',
    label: platformLabel('instagram'),
    accountName: null,
    metrics: {},
  };
  if (!accountId) {
    base.note = 'Instagram analytics need a connected Business/Creator account.';
    return base;
  }
  // The stored accountId is the Facebook Page; resolve its linked IG account.
  const pageRes = await fetch(
    `https://graph.facebook.com/v19.0/${accountId}?fields=instagram_business_account&access_token=${token}`
  );
  const pageData = await pageRes.json().catch(() => ({}));
  const igId = pageData?.instagram_business_account?.id as string | undefined;
  if (!igId) {
    base.note = `Could not resolve the Instagram account: ${pageData?.error?.message || 'no linked IG business account'}.`;
    return base;
  }
  const igRes = await fetch(
    `https://graph.facebook.com/v19.0/${igId}?fields=username,followers_count,follows_count,media_count&access_token=${token}`
  );
  const ig = await igRes.json().catch(() => ({}));
  if (!igRes.ok) {
    base.note = `Could not read Instagram analytics: ${ig?.error?.message || igRes.status}.`;
    return base;
  }
  base.accountName = ig.username ? `@${ig.username}` : null;
  base.metrics = {
    Followers: num(ig.followers_count),
    Following: num(ig.follows_count),
    Posts: num(ig.media_count),
  };

  // Account reach/impressions over the last week (needs instagram_manage_insights).
  try {
    const insRes = await fetch(
      `https://graph.facebook.com/v19.0/${igId}/insights?metric=reach,impressions&period=day&access_token=${token}`
    );
    const ins = await insRes.json().catch(() => ({}));
    if (insRes.ok && Array.isArray(ins.data)) {
      for (const metric of ins.data) {
        const values = metric.values as { value: number }[] | undefined;
        const total = (values ?? []).reduce((sum, v) => sum + num(v.value), 0);
        if (metric.name === 'reach') base.metrics['Reach (recent)'] = total;
        if (metric.name === 'impressions') base.metrics['Impressions (recent)'] = total;
      }
    } else if (ins?.error) {
      base.note = 'Follower/post counts shown; reach & impressions need the instagram_manage_insights scope.';
    }
  } catch {
    /* insights are best-effort */
  }
  return base;
}

/** Render an analytics result as a compact text block for the agent. */
export function formatSocialAnalytics(a: SocialAnalytics): string {
  const head = `${a.label}${a.accountName ? ` (${a.accountName})` : ''}`;
  const metrics = Object.entries(a.metrics)
    .map(([k, v]) => `  ${k}: ${typeof v === 'number' ? v.toLocaleString() : v}`)
    .join('\n');
  const lines = [head, metrics || '  (no metrics available)'];
  if (a.recent?.length) {
    lines.push('  Recent posts:');
    for (const r of a.recent) {
      const m = Object.entries(r.metrics)
        .map(([k, v]) => `${k} ${typeof v === 'number' ? v.toLocaleString() : v}`)
        .join(', ');
      lines.push(`    • ${r.title} — ${m}`);
    }
  }
  if (a.note) lines.push(`  Note: ${a.note}`);
  return lines.join('\n');
}
