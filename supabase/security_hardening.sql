-- Security & performance hardening for the Supabase database.
--
-- Generated from the live project's advisor lints (Supabase Dashboard >
-- Advisors) on 2026-07-06. REVIEW before running — apply in the Supabase SQL
-- Editor (Dashboard > SQL Editor > New query). Everything here is idempotent
-- (drop-if-exists then recreate) and semantically identical to the existing
-- policies, so it is safe to re-run.
--
-- Why each change:
--
-- 1) PERFORMANCE (advisor: auth_rls_initplan) — three policies still call
--    auth.uid() once PER ROW instead of once per statement. Wrapping the call
--    in a scalar sub-select `(select auth.uid())` lets Postgres evaluate it a
--    single time. All the other policies on these tables were already fixed;
--    these three (the DELETE policies + user_memories) were missed.
--
-- 2) SECURITY (advisor: auth_allow_anonymous_sign_ins) — the same policies are
--    granted to the `public` role, which includes the `anon` role. They are
--    already safe in practice (auth.uid() is NULL for anonymous requests, so the
--    row test can never match), but scoping them explicitly `to authenticated`
--    clears the warning and states intent. The pattern below can be copied to
--    the other flagged tables (analyses, bookings, clipflow_*, editor_projects,
--    gigs, keynotes, profiles, etc.) if you want to silence every instance —
--    just recreate each policy with `to authenticated` and no other change.

-- ── engagement_timeline: "Users delete own timeline" ───────────────────────
drop policy if exists "Users delete own timeline" on engagement_timeline;
create policy "Users delete own timeline" on engagement_timeline
  for delete to authenticated
  using (
    analysis_id in (select id from analyses where user_id = (select auth.uid()))
  );

-- ── feedback_points: "Users delete own feedback" ───────────────────────────
drop policy if exists "Users delete own feedback" on feedback_points;
create policy "Users delete own feedback" on feedback_points
  for delete to authenticated
  using (
    analysis_id in (select id from analyses where user_id = (select auth.uid()))
  );

-- ── user_memories: "own user_memories" ─────────────────────────────────────
drop policy if exists "own user_memories" on user_memories;
create policy "own user_memories" on user_memories
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ── Notes that CANNOT be fixed in SQL (do these in the Dashboard) ───────────
--
-- • Leaked password protection is DISABLED (advisor: auth_leaked_password_
--   protection). Turn it on at Dashboard > Authentication > Policies /
--   Password so Supabase rejects passwords found in HaveIBeenPwned breaches.
--   https://supabase.com/docs/guides/auth/password-security
--
-- • `access_requests` has RLS enabled with NO policies. This is intentional and
--   safe: it means the anon/authenticated roles cannot touch the table at all,
--   and the only writer is the /api/request-access route using the service-role
--   key (which bypasses RLS). No change needed — documented here so it is not
--   mistaken for a gap.
