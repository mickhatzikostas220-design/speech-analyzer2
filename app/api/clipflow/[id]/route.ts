import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: project, error } = await supabase
      .from('clipflow_projects')
      .select('id, source_url, source_type, youtube_id, title, description, channel_title, duration_seconds, thumbnail_url, status, progress, error, created_at')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single();

    if (error || !project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data: clips } = await supabase
      .from('clipflow_clips')
      .select('*')
      .eq('project_id', params.id)
      .order('position', { ascending: true });

    // Attach a signed URL for any rendered clip files, plus their post records.
    const admin = createAdminClient();
    const clipIds = (clips ?? []).map((c) => c.id);
    const { data: posts } = clipIds.length
      ? await admin.from('clipflow_posts').select('*').in('clip_id', clipIds)
      : { data: [] };

    const enriched = await Promise.all(
      (clips ?? []).map(async (clip) => {
        let videoUrl: string | null = null;
        if (clip.file_path) {
          const { data } = await admin.storage
            .from('speeches')
            .createSignedUrl(clip.file_path, 3600);
          videoUrl = data?.signedUrl ?? null;
        }
        return {
          ...clip,
          videoUrl,
          posts: (posts ?? []).filter((p) => p.clip_id === clip.id),
        };
      })
    );

    return NextResponse.json({ ...project, clips: enriched });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Remove any rendered clip files from storage first.
    const { data: clips } = await supabase
      .from('clipflow_clips')
      .select('file_path, thumbnail_url')
      .eq('project_id', params.id)
      .eq('user_id', user.id);

    const paths = (clips ?? [])
      .map((c) => c.file_path)
      .filter((p): p is string => Boolean(p));
    if (paths.length) {
      const admin = createAdminClient();
      await admin.storage.from('speeches').remove(paths);
    }

    const { error } = await supabase
      .from('clipflow_projects')
      .delete()
      .eq('id', params.id)
      .eq('user_id', user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
