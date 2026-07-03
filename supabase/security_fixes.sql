-- Security fixes — run this in the Supabase SQL Editor (safe to re-run).
-- Closes three RLS holes found in the July 2026 security audit and adds the
-- delete policies the analyzer's retry-cleanup needs. The per-feature .sql
-- files (schema.sql, access_requests.sql) are already updated to match, so
-- fresh setups get this state automatically — this file patches the LIVE db.

-- 1) CRITICAL: "Service reads speeches" had no role restriction, so ANY user
--    (even the public anon key) could download every speaker's uploaded
--    recordings from the private `speeches` bucket. The service role bypasses
--    RLS, so server code never needed this policy in the first place.
drop policy if exists "Service reads speeches" on storage.objects;

-- 2) MEDIUM: `with check (true)` insert policies let any signed-in user write
--    fake feedback / engagement rows into ANY other user's analysis. The GPU
--    worker inserts with the service-role key (bypasses RLS), so no insert
--    policy is needed at all.
drop policy if exists "Service inserts feedback" on feedback_points;
drop policy if exists "Service inserts timeline" on engagement_timeline;

-- 3) MEDIUM (correctness): retrying a failed analysis deletes stale feedback /
--    timeline rows with the USER-scoped client (app/api/analyses/[id]/process),
--    but no delete policy existed, so under RLS those deletes silently removed
--    nothing and a retried analysis could show duplicated results. Owner-scoped
--    delete policies make the cleanup actually work.
drop policy if exists "Users delete own feedback" on feedback_points;
create policy "Users delete own feedback" on feedback_points for delete using (
  analysis_id in (select id from analyses where user_id = auth.uid())
);
drop policy if exists "Users delete own timeline" on engagement_timeline;
create policy "Users delete own timeline" on engagement_timeline for delete using (
  analysis_id in (select id from analyses where user_id = auth.uid())
);

-- 4) LOW: the public request-access form inserts through the service-role
--    client (rate-limited + validated in /api/request-access), so this open
--    anon insert policy only served as a way for bots to bypass those checks
--    by writing to the table directly with the public anon key.
drop policy if exists "Anyone can submit request" on access_requests;
