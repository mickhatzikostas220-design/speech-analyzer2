import { NextRequest, NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { claimDueJobs, completeJob, failJob } from '@/lib/clipflow/queue';
import { runJob } from '@/lib/clipflow/runner';

/** Constant-time bearer-token check so the cron secret can't be guessed by timing. */
function cronTokenMatches(authHeader: string | null, secret: string): boolean {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const presented = createHash('sha256').update(authHeader.slice(7)).digest();
  const expected = createHash('sha256').update(secret).digest();
  return timingSafeEqual(presented, expected);
}

// Drains the ClipFlow job queue: processing pipelines and scheduled posts that
// are now due. Wire this to a scheduled trigger (e.g. a Vercel Cron hitting
// this route every minute with the CRON_SECRET bearer token). It can also be
// triggered by a signed-in user to flush their own queued work.
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  // Auth: either a valid cron secret (drains every tenant's due work), or a
  // signed-in user (drains only their own — never other users' jobs).
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  const cronAuthorized = !!cronSecret && cronTokenMatches(authHeader, cronSecret);

  let scopeUserId: string | undefined;
  if (!cronAuthorized) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    scopeUserId = user.id;
  }

  const admin = createAdminClient();
  const jobs = await claimDueJobs(admin, 5, scopeUserId);

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
