import { getAppKey } from '../store';
import type { ToolDef } from '../types';

// Social analytics tools. Each checks for its key and returns a helpful error when not connected.
// Keys are stored via the connected_app_keys table (app_id: 'twitter', 'instagram', etc.).

export function socialAnalyticsTools(): ToolDef[] {
  return [
    // ── X / Twitter ─────────────────────────────────────────────────────────
    {
      name: 'twitter_get_analytics',
      description:
        "Get X / Twitter profile stats (followers, tweet count) and recent tweet engagement metrics. Requires a Bearer token from developer.twitter.com.",
      sideEffect: 'none',
      parameters: {
        type: 'object',
        properties: {
          include_recent_tweets: {
            type: 'boolean',
            description: 'Also fetch recent tweet metrics (default: true).',
          },
        },
        required: [],
      },
      async execute(args, ctx) {
        const bearer = await getAppKey(ctx.supabase, ctx.userId, 'twitter');
        if (!bearer)
          return 'X / Twitter is not connected. Add your Bearer token in Agent → Connected Apps.';

        const userRes = await fetch(
          'https://api.twitter.com/2/users/me?user.fields=public_metrics,username,description',
          { headers: { Authorization: `Bearer ${bearer}` } }
        );
        if (!userRes.ok) return `Twitter API error: ${await userRes.text()}`;
        const ud = (await userRes.json()) as {
          data?: {
            id: string;
            name: string;
            username: string;
            description?: string;
            public_metrics?: {
              followers_count: number;
              following_count: number;
              tweet_count: number;
              listed_count: number;
            };
          };
        };
        const u = ud.data;
        if (!u) return 'Could not fetch Twitter profile.';

        const pm = u.public_metrics;
        let out =
          `@${u.username} (${u.name})\n` +
          `Followers: ${pm?.followers_count?.toLocaleString()}\n` +
          `Following: ${pm?.following_count?.toLocaleString()}\n` +
          `Tweets: ${pm?.tweet_count?.toLocaleString()}\n` +
          `Listed: ${pm?.listed_count?.toLocaleString()}`;

        if (args.include_recent_tweets !== false) {
          const tweetsRes = await fetch(
            `https://api.twitter.com/2/users/${u.id}/tweets?max_results=5&tweet.fields=public_metrics,created_at`,
            { headers: { Authorization: `Bearer ${bearer}` } }
          );
          if (tweetsRes.ok) {
            const td = (await tweetsRes.json()) as {
              data?: {
                text: string;
                created_at: string;
                public_metrics?: {
                  retweet_count: number;
                  like_count: number;
                  reply_count: number;
                  impression_count: number;
                };
              }[];
            };
            if (td.data?.length) {
              out +=
                '\n\nRecent tweets:\n' +
                td.data
                  .map(
                    (t) =>
                      `• "${t.text.slice(0, 80)}…"\n` +
                      `  Likes: ${t.public_metrics?.like_count} | RTs: ${t.public_metrics?.retweet_count} | ` +
                      `Replies: ${t.public_metrics?.reply_count} | Impressions: ${t.public_metrics?.impression_count}`
                  )
                  .join('\n');
            }
          }
        }
        return out;
      },
    },

    // ── Instagram ────────────────────────────────────────────────────────────
    {
      name: 'instagram_get_insights',
      description:
        "Get Instagram Business/Creator account stats and recent post performance. Requires an Instagram Graph API long-lived access token.",
      sideEffect: 'none',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'integer',
            description: 'Number of recent posts to include (default 5, max 10).',
          },
        },
        required: [],
      },
      async execute(args, ctx) {
        const token = await getAppKey(ctx.supabase, ctx.userId, 'instagram');
        if (!token)
          return 'Instagram is not connected. Add your Graph API access token in Agent → Connected Apps.';
        const limit = Math.min(Number(args.limit) || 5, 10);

        const profileRes = await fetch(
          `https://graph.instagram.com/me?fields=id,username,name,biography,followers_count,media_count&access_token=${token}`
        );
        if (!profileRes.ok) return `Instagram API error: ${await profileRes.text()}`;
        const profile = (await profileRes.json()) as {
          username?: string;
          followers_count?: number;
          media_count?: number;
        };

        let out =
          `@${profile.username ?? '?'}\n` +
          `Followers: ${profile.followers_count?.toLocaleString() ?? 'N/A'}\n` +
          `Total posts: ${profile.media_count?.toLocaleString() ?? 'N/A'}`;

        const mediaRes = await fetch(
          `https://graph.instagram.com/me/media?fields=id,caption,media_type,like_count,comments_count,timestamp&limit=${limit}&access_token=${token}`
        );
        if (mediaRes.ok) {
          const md = (await mediaRes.json()) as {
            data?: {
              caption?: string;
              media_type?: string;
              like_count?: number;
              comments_count?: number;
              timestamp?: string;
            }[];
          };
          if (md.data?.length) {
            out +=
              '\n\nRecent posts:\n' +
              md.data
                .map(
                  (m) =>
                    `• [${m.media_type}] "${(m.caption ?? '').slice(0, 60)}…" — ${m.timestamp?.slice(0, 10)}\n` +
                    `  Likes: ${m.like_count ?? 0} | Comments: ${m.comments_count ?? 0}`
                )
                .join('\n');
          }
        }
        return out;
      },
    },

    // ── YouTube ──────────────────────────────────────────────────────────────
    {
      name: 'youtube_get_channel_stats',
      description:
        "Get YouTube channel statistics: subscribers, total views, video count. Requires a YouTube Data API v3 key.",
      sideEffect: 'none',
      parameters: {
        type: 'object',
        properties: {
          channel_id: {
            type: 'string',
            description: 'YouTube channel ID (starts with UC...). Find it at youtube.com → Your channel → About.',
          },
        },
        required: ['channel_id'],
      },
      async execute(args, ctx) {
        const apiKey = await getAppKey(ctx.supabase, ctx.userId, 'youtube');
        if (!apiKey)
          return 'YouTube is not connected. Add your YouTube Data API v3 key in Agent → Connected Apps.';

        const r = await fetch(
          `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${encodeURIComponent(String(args.channel_id))}&key=${apiKey}`
        );
        if (!r.ok) return `YouTube API error: ${await r.text()}`;
        const data = (await r.json()) as {
          items?: {
            snippet?: { title?: string; customUrl?: string };
            statistics?: {
              subscriberCount?: string;
              viewCount?: string;
              videoCount?: string;
              hiddenSubscriberCount?: boolean;
            };
          }[];
        };
        if (!data.items?.length) return 'Channel not found. Double-check the channel ID.';
        const ch = data.items[0];
        const s = ch.statistics;
        return [
          ch.snippet?.title ?? 'Channel',
          ch.snippet?.customUrl ? `URL: youtube.com/${ch.snippet.customUrl}` : '',
          s?.hiddenSubscriberCount
            ? 'Subscribers: hidden'
            : `Subscribers: ${Number(s?.subscriberCount ?? 0).toLocaleString()}`,
          `Total views: ${Number(s?.viewCount ?? 0).toLocaleString()}`,
          `Videos: ${Number(s?.videoCount ?? 0).toLocaleString()}`,
        ]
          .filter(Boolean)
          .join('\n');
      },
    },

    // ── LinkedIn ─────────────────────────────────────────────────────────────
    {
      name: 'linkedin_get_profile',
      description:
        "Get LinkedIn profile info (name, headline). Requires a LinkedIn OAuth access token with r_liteprofile scope.",
      sideEffect: 'none',
      parameters: { type: 'object', properties: {}, required: [] },
      async execute(args, ctx) {
        const token = await getAppKey(ctx.supabase, ctx.userId, 'linkedin');
        if (!token)
          return 'LinkedIn is not connected. Add your access token in Agent → Connected Apps.';

        const r = await fetch(
          'https://api.linkedin.com/v2/me?projection=(id,firstName,lastName,headline)',
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'X-Restli-Protocol-Version': '2.0.0',
            },
          }
        );
        if (!r.ok) return `LinkedIn API error: ${await r.text()}`;
        const data = (await r.json()) as {
          id?: string;
          firstName?: { localized?: Record<string, string> };
          lastName?: { localized?: Record<string, string> };
          headline?: { localized?: Record<string, string> };
        };
        const first = data.firstName?.localized
          ? Object.values(data.firstName.localized)[0]
          : '';
        const last = data.lastName?.localized
          ? Object.values(data.lastName.localized)[0]
          : '';
        const headline = data.headline?.localized
          ? Object.values(data.headline.localized)[0]
          : '';
        return [`${first} ${last}`.trim(), headline, `LinkedIn ID: ${data.id}`]
          .filter(Boolean)
          .join('\n');
      },
    },

    // ── Facebook Pages ───────────────────────────────────────────────────────
    {
      name: 'facebook_get_page_insights',
      description:
        "Get Facebook Page stats: fans, followers, and talking-about count. Requires a Page access token.",
      sideEffect: 'none',
      parameters: {
        type: 'object',
        properties: {
          page_id: { type: 'string', description: 'Facebook Page ID or username.' },
        },
        required: ['page_id'],
      },
      async execute(args, ctx) {
        const token = await getAppKey(ctx.supabase, ctx.userId, 'facebook');
        if (!token)
          return 'Facebook is not connected. Add your Page access token in Agent → Connected Apps.';

        const r = await fetch(
          `https://graph.facebook.com/v19.0/${encodeURIComponent(String(args.page_id))}` +
            `?fields=id,name,fan_count,followers_count,talking_about_count&access_token=${token}`
        );
        if (!r.ok) return `Facebook API error: ${await r.text()}`;
        const page = (await r.json()) as {
          id?: string;
          name?: string;
          fan_count?: number;
          followers_count?: number;
          talking_about_count?: number;
        };
        return [
          page.name ?? 'Page',
          `Page ID: ${page.id}`,
          `Likes / fans: ${page.fan_count?.toLocaleString() ?? 'N/A'}`,
          `Followers: ${page.followers_count?.toLocaleString() ?? 'N/A'}`,
          `Talking about this: ${page.talking_about_count?.toLocaleString() ?? 'N/A'}`,
        ].join('\n');
      },
    },

    // ── TikTok ───────────────────────────────────────────────────────────────
    {
      name: 'tiktok_get_profile',
      description:
        "Get TikTok account stats: followers, following, likes, video count. Requires a TikTok OAuth access token.",
      sideEffect: 'none',
      parameters: { type: 'object', properties: {}, required: [] },
      async execute(args, ctx) {
        const token = await getAppKey(ctx.supabase, ctx.userId, 'tiktok');
        if (!token)
          return 'TikTok is not connected. Add your access token in Agent → Connected Apps.';

        const r = await fetch(
          'https://open.tiktokapis.com/v2/user/info/?fields=display_name,bio_description,follower_count,following_count,likes_count,video_count',
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!r.ok) return `TikTok API error: ${await r.text()}`;
        const data = (await r.json()) as {
          data?: {
            user?: {
              display_name?: string;
              bio_description?: string;
              follower_count?: number;
              following_count?: number;
              likes_count?: number;
              video_count?: number;
            };
          };
        };
        const u = data.data?.user;
        if (!u) return 'Could not fetch TikTok profile.';
        return [
          u.display_name ?? 'TikTok User',
          u.bio_description ?? '',
          `Followers: ${u.follower_count?.toLocaleString() ?? 'N/A'}`,
          `Following: ${u.following_count?.toLocaleString() ?? 'N/A'}`,
          `Total likes: ${u.likes_count?.toLocaleString() ?? 'N/A'}`,
          `Videos: ${u.video_count?.toLocaleString() ?? 'N/A'}`,
        ]
          .filter(Boolean)
          .join('\n');
      },
    },
  ];
}

// Map tool name prefix → app_id for enabling only connected tools.
export const SOCIAL_TOOL_APP_MAP: Record<string, string> = {
  twitter_: 'twitter',
  instagram_: 'instagram',
  youtube_: 'youtube',
  linkedin_: 'linkedin',
  facebook_: 'facebook',
  tiktok_: 'tiktok',
};
