import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { enqueue } from '@/lib/clipflow/queue';
import { publishOnePost } from '@/lib/clipflow/runner';
import { PLATFORMS, type Platform } from '@/lib/clipflow/types';

// Publish (or schedule) a clip to one or more connected platforms.
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const raw = (await request.text()).trim();
    const body = raw ? JSON.parse(raw) : {};
    const platforms: Platform[] = Array.isArray(body.platforms)
      ? body.platforms.filter((p: string): p is Platform => PLATFORMS.includes(p as Platform))
      : [];
    const scheduledAt: string | null = body.scheduledAt ?? null;

    if (platforms.length === 0) {
      return NextResponse.json({ error: 'Select at least one platform.' }, { status: 400 });
    }

    const { data: clip } = await supabase
      .from('clipflow_clips')
      .select('id')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single();
    if (!clip) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const future = scheduledAt && new Date(scheduledAt).getTime() > Date.now();
    const admin = createAdminClient();

    // Replace any prior post records for these platforms so each platform keeps
    // a single current status rather than accumulating duplicates on re-post.
    await admin
      .from('clipflow_posts')
      .delete()
      .eq('clip_id', clip.id)
      .in('platform', platforms);

    // Create a post row per platform.
    const rows = platforms.map((platform) => ({
      clip_id: clip.id,
      user_id: user.id,
      platform,
      status: future ? ('scheduled' as const) : ('queued' as const),
      scheduled_at: future ? scheduledAt : null,
    }));

    const { data: posts, error } = await admin
      .from('clipflow_posts')
      .insert(rows)
      .select('*');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (future) {
      // Hand off to the queue; the cron job-runner publishes when due.
      await Promise.all(
        (posts ?? []).map((p) =>
          enqueue(admin, {
            user_id: user.id,
            type: 'publish_post',
            payload: { postId: p.id },
            run_after: scheduledAt!,
          })
        )
      );
      return NextResponse.json({ posts });
    }

    // Post now — publish synchronously so the user sees immediate status.
    await Promise.all(
      (posts ?? []).map((p) => publishOnePost(admin, p.id).catch(() => {}))
    );

    const { data: updated } = await admin
      .from('clipflow_posts')
      .select('*')
      .in('id', (posts ?? []).map((p) => p.id));

    return NextResponse.json({ posts: updated ?? posts });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
