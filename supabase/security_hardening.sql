-- ============================================================================
-- Security hardening — run this in the Supabase SQL editor.
--
-- These statements TIGHTEN existing Row-Level Security policies. They are safe
-- to run more than once. Everything the app does normally goes through the
-- service-role client (which BYPASSES RLS), so tightening the anon/authenticated
-- policies below does NOT change any legitimate app behaviour — it only removes
-- ways a logged-in user could reach other users' data with the public anon key.
--
-- Review each block before running. Nothing here drops data.
-- ============================================================================

-- 1) Private speech files must NOT be world-readable to any signed-in user. ----
--    The original schema.sql created:
--        create policy "Service reads speeches" on storage.objects
--          for select using (bucket_id = 'speeches');
--    RLS policies are OR-combined, so that broad policy let ANY authenticated
--    (and anon) user read EVERY file in the private 'speeches' bucket, not just
--    their own. The service role bypasses RLS entirely, so this policy was never
--    needed for the backend. Drop it — the owner-scoped "Users read own
--    speeches" policy (folder = auth.uid()) still applies.
drop policy if exists "Service reads speeches" on storage.objects;

-- 2) feedback_points / engagement_timeline: only the owner may insert. --------
--    Originally: insert with check (true) — any authenticated user could write
--    feedback rows onto ANY analysis. Rows are actually written by the GPU
--    worker using the service role (which bypasses RLS), so restricting the
--    public policy to the owning analysis is safe and closes the write hole.
drop policy if exists "Service inserts feedback" on feedback_points;
create policy "Owner inserts feedback" on feedback_points for insert with check (
  analysis_id in (select id from analyses where user_id = auth.uid())
);

drop policy if exists "Service inserts timeline" on engagement_timeline;
create policy "Owner inserts timeline" on engagement_timeline for insert with check (
  analysis_id in (select id from analyses where user_id = auth.uid())
);

-- ============================================================================
-- After running, verify with:
--   select tablename, policyname, cmd
--   from pg_policies
--   where schemaname in ('public','storage')
--   order by tablename, policyname;
-- Also run Supabase's own linter: Dashboard > Advisors > Security.
-- ============================================================================
