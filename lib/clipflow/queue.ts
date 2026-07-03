import type { SupabaseClient } from '@supabase/supabase-js';

// A lightweight Postgres-backed job queue (the "Bull or similar" requirement),
// implemented on Supabase so it works in a serverless deployment with no extra
// infrastructure (Redis, a worker dyno, etc.). Jobs are claimed atomically by
// flipping status queued -> running, retried up to max_attempts, and can be
// scheduled for the future via run_after (used for scheduled posts).
//
// To swap in Bull/BullMQ later, keep these function signatures and back them
// with a Redis queue instead of the clipflow_jobs table.

export type JobType = 'process_project' | 'render_clip' | 'publish_post';

export interface Job {
  id: string;
  project_id: string | null;
  user_id: string;
  type: JobType;
  payload: Record<string, unknown>;
  status: 'queued' | 'running' | 'done' | 'failed';
  attempts: number;
  max_attempts: number;
  run_after: string;
}

export async function enqueue(
  admin: SupabaseClient,
  job: {
    user_id: string;
    type: JobType;
    project_id?: string | null;
    payload?: Record<string, unknown>;
    run_after?: string;
  }
): Promise<string | null> {
  const { data, error } = await admin
    .from('clipflow_jobs')
    .insert({
      user_id: job.user_id,
      type: job.type,
      project_id: job.project_id ?? null,
      payload: job.payload ?? {},
      run_after: job.run_after ?? new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error) return null;
  return data.id;
}

/**
 * Claim up to `limit` due jobs, flipping them to running.
 *
 * Pass `userId` to claim only that user's jobs. The cron/worker caller omits it
 * to drain the whole queue; a request triggered by an end user MUST pass their
 * own id so one signed-in account can't force-process (and burn compute on)
 * another user's queued work.
 */
export async function claimDueJobs(
  admin: SupabaseClient,
  limit = 5,
  userId?: string
): Promise<Job[]> {
  let query = admin
    .from('clipflow_jobs')
    .select('*')
    .eq('status', 'queued')
    .lte('run_after', new Date().toISOString());
  if (userId) query = query.eq('user_id', userId);
  const { data: due } = await query
    .order('run_after', { ascending: true })
    .limit(limit);

  if (!due || due.length === 0) return [];

  const claimed: Job[] = [];
  for (const job of due as Job[]) {
    // Conditional update acts as an optimistic lock against concurrent runners.
    const { data, error } = await admin
      .from('clipflow_jobs')
      .update({ status: 'running', attempts: job.attempts + 1, updated_at: new Date().toISOString() })
      .eq('id', job.id)
      .eq('status', 'queued')
      .select('*')
      .single();
    if (!error && data) claimed.push(data as Job);
  }
  return claimed;
}

export async function completeJob(admin: SupabaseClient, id: string): Promise<void> {
  await admin
    .from('clipflow_jobs')
    .update({ status: 'done', updated_at: new Date().toISOString() })
    .eq('id', id);
}

export async function failJob(admin: SupabaseClient, job: Job, message: string): Promise<void> {
  const exhausted = job.attempts >= job.max_attempts;
  await admin
    .from('clipflow_jobs')
    .update({
      status: exhausted ? 'failed' : 'queued',
      last_error: message,
      // Back off a minute before the next retry.
      run_after: exhausted ? job.run_after : new Date(Date.now() + 60_000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', job.id);
}
