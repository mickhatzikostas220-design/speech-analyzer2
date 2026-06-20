import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { renderClipBuffers, ClipperUnavailableError } from '@/lib/clipflow/clipper';
import type { TranscriptCue } from '@/lib/clipflow/types';

// Renders the actual vertical 9:16 video file for a single clip (FFmpeg +
// yt-dlp). The clip plan, captions, and copy already exist after processing —
// this step produces the downloadable/publishable MP4.
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: clip } = await supabase
    .from('clipflow_clips')
    .select('*')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single();
  if (!clip) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: project } = await supabase
    .from('clipflow_projects')
    .select('youtube_id, transcript')
    .eq('id', clip.project_id)
    .single();

  if (!project?.youtube_id) {
    return NextResponse.json({ error: 'Project has no source video.' }, { status: 400 });
  }

  await supabase.from('clipflow_clips').update({ status: 'rendering', error: null }).eq('id', clip.id);

  try {
    const { video } = await renderClipBuffers({
      youtubeId: project.youtube_id,
      start: clip.start_seconds,
      end: clip.end_seconds,
      cues: (project.transcript as TranscriptCue[] | null) ?? null,
      captionStyle: clip.caption_style,
      burnCaptions: true,
    });

    const admin = createAdminClient();
    const path = `${user.id}/clipflow/${clip.project_id}/${clip.id}.mp4`;
    const { error: upErr } = await admin.storage
      .from('speeches')
      .upload(path, video, { upsert: true, contentType: 'video/mp4' });
    if (upErr) throw new Error(upErr.message);

    await supabase
      .from('clipflow_clips')
      .update({ file_path: path, status: 'ready', error: null, updated_at: new Date().toISOString() })
      .eq('id', clip.id);

    const { data: signed } = await admin.storage.from('speeches').createSignedUrl(path, 3600);
    return NextResponse.json({ status: 'ready', videoUrl: signed?.signedUrl ?? null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase
      .from('clipflow_clips')
      .update({ status: 'error', error: msg, updated_at: new Date().toISOString() })
      .eq('id', clip.id);
    // Tools-missing (local render) is an expected, recoverable condition — 422.
    const status = err instanceof ClipperUnavailableError ? 422 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
