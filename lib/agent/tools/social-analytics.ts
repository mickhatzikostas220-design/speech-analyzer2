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

    // ── X / Twitter — post tweet ─────────────────────────────────────────────
    // Requires an OAuth 2.0 user access token with tweet.write scope.
    // A bearer token (app-only) cannot post — users must supply a user token.
    {
      name: 'twitter_post_tweet',
      description:
        "Post a tweet on X / Twitter. Requires an OAuth 2.0 USER access token with tweet.write scope (not a Bearer/app-only token). Get one at developer.twitter.com → OAuth 2.0 user context.",
      sideEffect: 'irreversible',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Tweet text (max 280 characters).' },
          reply_to_tweet_id: {
            type: 'string',
            description: 'Optional tweet ID to reply to.',
          },
        },
        required: ['text'],
      },
      async execute(args, ctx) {
        const token = await getAppKey(ctx.supabase, ctx.userId, 'twitter');
        if (!token)
          return 'X / Twitter is not connected. Add your OAuth 2.0 user access token in Agent → Connected Apps. Note: a Bearer (app-only) token cannot post — you need a user token with tweet.write scope.';

        const body: Record<string, unknown> = { text: String(args.text).slice(0, 280) };
        if (args.reply_to_tweet_id) {
          body.reply = { in_reply_to_tweet_id: String(args.reply_to_tweet_id) };
        }

        const r = await fetch('https://api.twitter.com/2/tweets', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
        if (!r.ok) {
          const errText = await r.text();
          if (errText.includes('Unauthorized') || r.status === 401) {
            return 'Twitter posting failed: your stored token may be an app-only Bearer token. Post requires an OAuth 2.0 user access token with tweet.write scope.';
          }
          return `Twitter API error (${r.status}): ${errText}`;
        }
        const data = (await r.json()) as { data?: { id?: string; text?: string } };
        return `Tweet posted! ID: ${data.data?.id ?? 'unknown'}\nText: ${data.data?.text ?? args.text}`;
      },
    },

    // ── Instagram — create post ───────────────────────────────────────────────
    // Two-step: create media container then publish it.
    // Requires instagram_content_publish scope on the Graph API token.
    {
      name: 'instagram_create_post',
      description:
        "Post a photo or reel to an Instagram Business/Creator account. Requires a Graph API long-lived token with instagram_content_publish and pages_read_engagement scopes. Provide a publicly accessible image URL.",
      sideEffect: 'irreversible',
      parameters: {
        type: 'object',
        properties: {
          ig_user_id: {
            type: 'string',
            description: 'Instagram Business account ID (numeric). Find via instagram_get_insights.',
          },
          image_url: {
            type: 'string',
            description: 'Publicly accessible URL of the image to post (JPEG or PNG).',
          },
          caption: { type: 'string', description: 'Post caption text.' },
        },
        required: ['ig_user_id', 'image_url'],
      },
      async execute(args, ctx) {
        const token = await getAppKey(ctx.supabase, ctx.userId, 'instagram');
        if (!token)
          return 'Instagram is not connected. Add your Graph API access token in Agent → Connected Apps.';

        const BASE = 'https://graph.facebook.com/v19.0';
        const igUserId = encodeURIComponent(String(args.ig_user_id));

        // Step 1: create media container
        const containerParams = new URLSearchParams({
          image_url: String(args.image_url),
          caption: String(args.caption ?? ''),
          access_token: token,
        });
        const containerRes = await fetch(`${BASE}/${igUserId}/media`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: containerParams.toString(),
        });
        if (!containerRes.ok) return `Instagram media container error: ${await containerRes.text()}`;
        const containerData = (await containerRes.json()) as { id?: string };
        if (!containerData.id) return 'Instagram: failed to create media container.';

        // Step 2: publish the container
        const publishParams = new URLSearchParams({
          creation_id: containerData.id,
          access_token: token,
        });
        const publishRes = await fetch(`${BASE}/${igUserId}/media_publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: publishParams.toString(),
        });
        if (!publishRes.ok) return `Instagram publish error: ${await publishRes.text()}`;
        const publishData = (await publishRes.json()) as { id?: string };
        return `Instagram post published! Media ID: ${publishData.id ?? 'unknown'}`;
      },
    },

    // ── Facebook Pages — create post ──────────────────────────────────────────
    {
      name: 'facebook_post_to_page',
      description:
        "Post a message (and optionally a link) to a Facebook Page. Requires a Page access token with pages_manage_posts scope.",
      sideEffect: 'irreversible',
      parameters: {
        type: 'object',
        properties: {
          page_id: { type: 'string', description: 'Facebook Page ID or username.' },
          message: { type: 'string', description: 'Text content of the post.' },
          link: { type: 'string', description: 'Optional URL to attach to the post.' },
        },
        required: ['page_id', 'message'],
      },
      async execute(args, ctx) {
        const token = await getAppKey(ctx.supabase, ctx.userId, 'facebook');
        if (!token)
          return 'Facebook is not connected. Add your Page access token in Agent → Connected Apps.';

        const body: Record<string, string> = {
          message: String(args.message),
          access_token: token,
        };
        if (args.link) body.link = String(args.link);

        const r = await fetch(
          `https://graph.facebook.com/v19.0/${encodeURIComponent(String(args.page_id))}/feed`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }
        );
        if (!r.ok) return `Facebook API error: ${await r.text()}`;
        const data = (await r.json()) as { id?: string };
        return `Facebook post published! Post ID: ${data.id ?? 'unknown'}`;
      },
    },

    // ── LinkedIn — share post ─────────────────────────────────────────────────
    // Uses the UGC Posts API. Token needs w_member_social scope.
    {
      name: 'linkedin_share_post',
      description:
        "Share a text post on LinkedIn (as yourself). Requires an OAuth access token with w_member_social scope. Get one at linkedin.com/developers with the Share on LinkedIn product enabled.",
      sideEffect: 'irreversible',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Post text (up to 3000 characters).' },
          article_url: {
            type: 'string',
            description: 'Optional URL of an article to share alongside the text.',
          },
          article_title: { type: 'string', description: 'Title for the shared article (if article_url provided).' },
        },
        required: ['text'],
      },
      async execute(args, ctx) {
        const token = await getAppKey(ctx.supabase, ctx.userId, 'linkedin');
        if (!token)
          return 'LinkedIn is not connected. Add your OAuth access token (with w_member_social scope) in Agent → Connected Apps.';

        // Get the member URN first
        const meRes = await fetch('https://api.linkedin.com/v2/me', {
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Restli-Protocol-Version': '2.0.0',
          },
        });
        if (!meRes.ok) return `LinkedIn auth error: ${await meRes.text()}`;
        const me = (await meRes.json()) as { id?: string };
        if (!me.id) return 'LinkedIn: could not fetch your member ID.';

        const shareContent: Record<string, unknown> = {
          shareCommentary: { text: String(args.text).slice(0, 3000) },
          shareMediaCategory: args.article_url ? 'ARTICLE' : 'NONE',
        };

        if (args.article_url) {
          shareContent.media = [
            {
              status: 'READY',
              originalUrl: String(args.article_url),
              ...(args.article_title ? { title: { text: String(args.article_title) } } : {}),
            },
          ];
        }

        const body = {
          author: `urn:li:person:${me.id}`,
          lifecycleState: 'PUBLISHED',
          specificContent: { 'com.linkedin.ugc.ShareContent': shareContent },
          visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
        };

        const r = await fetch('https://api.linkedin.com/v2/ugcPosts', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0',
          },
          body: JSON.stringify(body),
        });
        if (!r.ok) {
          const errText = await r.text();
          if (errText.includes('UNAUTHORIZED') || r.status === 403) {
            return 'LinkedIn posting failed: your token may be missing the w_member_social scope. Re-generate your token with that scope enabled.';
          }
          return `LinkedIn API error (${r.status}): ${errText}`;
        }
        const data = (await r.json()) as { id?: string };
        return `LinkedIn post published! Post ID: ${data.id ?? 'unknown'}`;
      },
    },

    // ── TikTok — post video ───────────────────────────────────────────────────
    // Uses Content Posting API (pull from URL). Token needs video.publish scope.
    {
      name: 'tiktok_post_video',
      description:
        "Post a video to TikTok using a publicly accessible video URL. Requires an OAuth access token with video.publish scope. The video must be hosted at a public URL (e.g., cloud storage).",
      sideEffect: 'irreversible',
      parameters: {
        type: 'object',
        properties: {
          video_url: { type: 'string', description: 'Publicly accessible URL of the video file (MP4).' },
          title: { type: 'string', description: 'Post title/caption (up to 150 characters).' },
          privacy_level: {
            type: 'string',
            enum: ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY'],
            description: 'Who can see the video (default: PUBLIC_TO_EVERYONE).',
          },
          disable_comment: { type: 'boolean', description: 'Disable comments (default: false).' },
          disable_duet: { type: 'boolean', description: 'Disable duet (default: false).' },
          disable_stitch: { type: 'boolean', description: 'Disable stitch (default: false).' },
        },
        required: ['video_url', 'title'],
      },
      async execute(args, ctx) {
        const token = await getAppKey(ctx.supabase, ctx.userId, 'tiktok');
        if (!token)
          return 'TikTok is not connected. Add your OAuth access token (with video.publish scope) in Agent → Connected Apps.';

        const body = {
          post_info: {
            title: String(args.title).slice(0, 150),
            privacy_level: String(args.privacy_level ?? 'PUBLIC_TO_EVERYONE'),
            disable_comment: Boolean(args.disable_comment ?? false),
            disable_duet: Boolean(args.disable_duet ?? false),
            disable_stitch: Boolean(args.disable_stitch ?? false),
          },
          source_info: {
            source: 'PULL_FROM_URL',
            video_url: String(args.video_url),
          },
        };

        const r = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json; charset=UTF-8',
          },
          body: JSON.stringify(body),
        });
        if (!r.ok) {
          const errText = await r.text();
          if (r.status === 401 || errText.includes('access_token_invalid')) {
            return 'TikTok posting failed: your token may be missing the video.publish scope or has expired. Re-generate at developers.tiktok.com.';
          }
          return `TikTok API error (${r.status}): ${errText}`;
        }
        const data = (await r.json()) as { data?: { publish_id?: string } };
        return `TikTok video upload initiated! Publish ID: ${data.data?.publish_id ?? 'unknown'}. The video will be processed and published shortly.`;
      },
    },
  ];
}

// Map tool name prefix → app_id for enabling only connected tools.
// Both analytics and posting tools share the same prefix, so adding a key
// unlocks read AND write tools for that platform automatically.
export const SOCIAL_TOOL_APP_MAP: Record<string, string> = {
  twitter_: 'twitter',
  instagram_: 'instagram',
  youtube_: 'youtube',
  linkedin_: 'linkedin',
  facebook_: 'facebook',
  tiktok_: 'tiktok',
};
