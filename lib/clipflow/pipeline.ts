import type { SupabaseClient } from '@supabase/supabase-js';
import {
  parseSourceUrl,
  getVideoMeta,
  getChannelRecentVideos,
  getTranscript,
  transcriptWindowText,
  type VideoMeta,
} from './youtube';
import { detectClips } from './ai';
import type { ClipFlowProject, TranscriptCue } from './types';

// Orchestrates a project from raw URL to a grid of captioned clip plans.
// Each phase persists status + progress, so a call that runs out of time can be
// safely retried: re-invoking advances from wherever the last call stopped.

async function update(
  admin: SupabaseClient,
  id: string,
  patch: Partial<ClipFlowProject>
): Promise<void> {
  await admin
    .from('clipflow_projects')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
}

function clipCountForDuration(seconds: number): number {
  return Math.min(10, Math.max(3, Math.round(seconds / 300) + 2));
}

export async function processProject(
  admin: SupabaseClient,
  projectId: string
): Promise<void> {
  // Atomically claim the project so concurrent runners (the client's /process
  // call and the cron job-runner) can't double-process. A run is re-claimable
  // only if it's fresh (queued/error) or a previous run stalled (>2 min old),
  // which is what makes the pipeline safely resumable.
  // Strip milliseconds so the embedded dot can't confuse PostgREST's .or() parser.
  const stale = new Date(Date.now() - 2 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const { data: project } = await admin
    .from('clipflow_projects')
    .update({ status: 'fetching', progress: 10, error: null, updated_at: new Date().toISOString() })
    .eq('id', projectId)
    .neq('status', 'ready')
    .or(`status.eq.queued,status.eq.error,updated_at.lt.${stale}`)
    .select('*')
    .single();

  // Not claimed: already processing recently, already ready, or gone.
  if (!project) return;

  try {
    // 1) Resolve the source URL to a concrete video id.
    const parsed = parseSourceUrl(project.source_url);

    let videoId = project.youtube_id as string | null;
    if (!videoId) {
      if (parsed.type === 'channel') {
        const recent = await getChannelRecentVideos(parsed, 1);
        videoId = recent[0] ?? null;
        if (!videoId) throw new Error('No recent videos found on that channel.');
      } else {
        videoId = parsed.videoId ?? null;
      }
    }
    if (!videoId) throw new Error('Could not determine a video to process.');

    // 2) Metadata.
    const meta: VideoMeta = await getVideoMeta(videoId);
    await update(admin, projectId, {
      youtube_id: videoId,
      title: meta.title,
      description: meta.description,
      channel_title: meta.channelTitle,
      duration_seconds: meta.durationSeconds,
      thumbnail_url: meta.thumbnailUrl,
      progress: 30,
    });

    // 3) Transcript (best-effort).
    await update(admin, projectId, { status: 'transcribing', progress: 45 });
    const cues: TranscriptCue[] | null = await getTranscript(videoId);
    if (cues) await update(admin, projectId, { transcript: cues });

    // 4) Detect high-value moments. Clip AI always runs on the app-wide
    // OPENAI_API_KEY (see lib/ai-config) — users no longer bring their own key.
    await update(admin, projectId, { status: 'analyzing', progress: 65 });
    const maxClips = clipCountForDuration(meta.durationSeconds);
    const candidates = await detectClips(meta, cues, {
      maxClips,
      preferences: project.preferences ?? undefined,
    });

    if (candidates.length === 0) {
      throw new Error('No clips could be generated for this video.');
    }

    // 5) Persist clips.
    await update(admin, projectId, { status: 'clipping', progress: 85 });
    // Replace any clips from a previous run.
    await admin.from('clipflow_clips').delete().eq('project_id', projectId);

    const rows = candidates.map((c, i) => ({
      project_id: projectId,
      user_id: project.user_id,
      position: i,
      start_seconds: c.start,
      end_seconds: c.end,
      title: c.title,
      caption: c.caption,
      description: c.description,
      hashtags: c.hashtags,
      transcript_text:
        c.transcript_text || (cues ? transcriptWindowText(cues, c.start, c.end) : ''),
      score: c.score,
      reason: c.reason,
      thumbnail_url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      status: 'draft' as const,
    }));
    await admin.from('clipflow_clips').insert(rows);

    await update(admin, projectId, { status: 'ready', progress: 100 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await update(admin, projectId, { status: 'error', error: message });
    throw err;
  }
}
