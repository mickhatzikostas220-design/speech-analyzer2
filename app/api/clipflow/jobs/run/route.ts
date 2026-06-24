import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { claimDueJobs, completeJob, failJob } from '@/lib/clipflow/queue';
import { runJob } from '@/lib/clipflow/runner';

// Constant-time bearer-token check so the cron secret can't be recovered by
// timing the response to a `===` comparison.
function bearerMatches(authHeader: string | null, secret: string): boolean {
  if (!authHeader) return false;
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(authHeader);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Drains the ClipFlow job queue: processing pipelines and scheduled posts that
// are now due. Wire this to a scheduled trigger (e.g. a Vercel Cron hitting
// this route every minute with the CRON_SECRET bearer token). It can also be
// triggered by a signed-in user to flush their own queued work.
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  // Auth: either a valid cron secret, or a signed-in user.
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  const cronAuthorized = !!cronSecret && bearerMatches(authHeader, cronSecret);

  if (!cronAuthorized) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const jobs = await claimDueJobs(admin, 5);

  const results = await Promise.all(
    jobs.map(async (job) => {
      try {
        await runJob(admin, job);
        await completeJob(admin, job.id);
        return { id: job.id, type: job.type, status: 'done' };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await failJob(admin, job, msg);
        return { id: job.id, type: job.type, status: 'failed', error: msg };
      }
    })
  );

  return NextResponse.json({ processed: results.length, results });
}
