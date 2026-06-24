import type { ToolDef } from '../types';

interface PostRow {
  platform: string;
  status: string;
  posted_at: string | null;
  external_url: string | null;
  created_at: string;
  clip_id: string;
}

const PLATFORM_LABEL: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  twitter: 'X',
};

// Social-media analytics tools: let the agent read the user's own ClipFlow
// publishing activity — what clips went out, to which platforms, and their
// status/links — so it can report on social performance. Read-only; always
// available (no connection required, the data is the user's own ClipFlow rows).
export const socialTools: ToolDef[] = [
  {
    name: 'social_media_overview',
    description:
      "Summarize the user's social-media posting activity from ClipFlow: totals per platform and status (posted, scheduled, queued, failed), and the most recent posts with their links. Use this when the user asks about their clips, posts, social media activity, or analytics.",
    sideEffect: 'none',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: 'Max recent posts to list (default 10, max 25).' },
      },
    },
    async execute(args, ctx) {
      const limit = Math.min(Number(args.limit) || 10, 25);

      const { data, error } = await ctx.supabase
        .from('clipflow_posts')
        .select('platform, status, posted_at, external_url, created_at, clip_id')
        .eq('user_id', ctx.userId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) return `Error: ${error.message}`;
      const posts = (data ?? []) as PostRow[];
      if (posts.length === 0) {
        return 'No social posts yet. The user can generate clips in ClipFlow and post them to their connected accounts.';
      }

      // Aggregate platform × status.
      const byPlatform = new Map<string, Record<string, number>>();
      for (const p of posts) {
        const row = byPlatform.get(p.platform) ?? {};
        row[p.status] = (row[p.status] ?? 0) + 1;
        byPlatform.set(p.platform, row);
      }

      const summary = Array.from(byPlatform.entries())
        .map(([platform, counts]) => {
          const parts = Object.entries(counts)
            .map(([s, n]) => `${n} ${s}`)
            .join(', ');
          return `- ${PLATFORM_LABEL[platform] ?? platform}: ${parts}`;
        })
        .join('\n');

      const recent = posts
        .slice(0, limit)
        .map((p) => {
          const label = PLATFORM_LABEL[p.platform] ?? p.platform;
          const when = p.posted_at
            ? new Date(p.posted_at).toLocaleDateString()
            : new Date(p.created_at).toLocaleDateString();
          return `- ${label} | ${p.status}${p.external_url ? ` | ${p.external_url}` : ''} | ${when}`;
        })
        .join('\n');

      return [
        `Total posts: ${posts.length}`,
        '',
        'By platform:',
        summary,
        '',
        'Recent posts:',
        recent,
      ].join('\n');
    },
  },
];
