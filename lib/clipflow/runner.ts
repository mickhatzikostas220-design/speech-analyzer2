import type { SupabaseClient } from '@supabase/supabase-js';
import { processProject } from './pipeline';
import { publishClip } from './platforms';
import { decryptToken } from './crypto';
import type { Job } from './queue';
import type { Platform, PlatformHashtags } from './types';

// Server-side execution for queued/scheduled work. Platform access tokens are
// decrypted here, used immediately, and never returned to any caller.

function tagsForPlatform(hashtags: PlatformHashtags | null, platform: Platform): string[] {
  if (!hashtags) return [];
  return (hashtags[platform] && hashtags[platform]!.length
    ? hashtags[platform]!
    : hashtags.default) ?? [];
}

/** Publish a single clipflow_posts row to its platform. */
export async function publishOnePost(admin: SupabaseClient, postId: string): Promise<void> {
  const { data: post } = await admin.from('clipflow_posts').select('*').eq('id', postId).single();
  if (!post || post.status === 'posted') return;

  const setStatus = (patch: Record<string, unknown>) =>
    admin
      .from('clipflow_posts')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', postId);

  await setStatus({ status: 'posting', error: null });

  try {
    const { data: clip } = await admin
      .from('clipflow_clips')
      .select('*')
      .eq('id', post.clip_id)
      .single();
    if (!clip) throw new Error('Clip no longer exists.');
    if (!clip.file_path) {
      throw new Error('Render the clip into a video before posting.');
    }

    const { data: signed } = await admin.storage
      .from('speeches')
      .createSignedUrl(clip.file_path, 60 * 60 * 24);
    if (!signed?.signedUrl) throw new Error('Could not create a video URL.');

    const platform = post.platform as Platform;
    const hashtags = tagsForPlatform(clip.hashtags as PlatformHashtags, platform);

    // Publish through the user's own per-platform OAuth connection: they sign in
    // once, the access token is stored encrypted, and it's decrypted and used here.
    const { data: connection } = await admin
      .from('clipflow_connections')
      .select('*')
      .eq('user_id', post.user_id)
      .eq('platform', post.platform)
      .single();
    if (!connection?.encrypted_access_token) {
      throw new Error(`Connect your ${post.platform} account before posting.`);
    }

    const result = await publishClip(platform, {
      accessToken: decryptToken(connection.encrypted_access_token),
      accountId: connection.account_id,
      videoUrl: signed.signedUrl,
      title: clip.title ?? '',
      description: clip.description ?? '',
      hashtags,
    });

    await setStatus({
      status: 'posted',
      posted_at: new Date().toISOString(),
      external_url: result.externalUrl,
      external_id: result.externalId,
    });
  } catch (err) {
    await setStatus({ status: 'failed', error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

/** Dispatch a queued job to its handler. */
export async function runJob(admin: SupabaseClient, job: Job): Promise<void> {
  switch (job.type) {
    case 'process_project': {
      const projectId = (job.payload.projectId as string) || job.project_id;
      if (projectId) await processProject(admin, projectId);
      return;
    }
    case 'publish_post': {
      const postId = job.payload.postId as string;
      if (postId) await publishOnePost(admin, postId);
      return;
    }
    case 'render_clip':
      // Rendering is handled on-demand by the clip render route.
      return;
  }
}
