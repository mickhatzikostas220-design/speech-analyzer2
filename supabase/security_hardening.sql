-- Security & performance hardening — applied to the live project on 2026-06-22.
-- Idempotent; safe to re-run. Already reflected inline in schema.sql / brand.sql
-- / *.sql; this file is the single, ordered record of what was changed and why.

-- ── 1. CRITICAL: private "speeches" bucket was world-readable ────────────────
-- "Service reads speeches" granted SELECT on EVERY object in the private
-- speeches bucket to the public role (anon + authenticated), so any signed-in
-- user could download any other user's recordings. The service role bypasses
-- RLS, so server routes never needed it.
drop policy if exists "Service reads speeches" on storage.objects;

-- ── 2. brand-assets bucket: stop allowing full enumeration ───────────────────
-- Public buckets serve objects via their public URL without an RLS SELECT
-- policy; the broad policy only enabled listing every file. Drop it.
drop policy if exists "Public read brand assets" on storage.objects;

-- ── 3. feedback_points / engagement_timeline: drop "WITH CHECK (true)" inserts
-- These allowed any role to insert arbitrary rows (fake feedback against any
-- analysis). The only legitimate writer is the Modal GPU callback using the
-- service-role key, which bypasses RLS.
drop policy if exists "Service inserts feedback" on feedback_points;
drop policy if exists "Service inserts timeline" on engagement_timeline;

-- ── 4. handle_new_user(): pin search_path + revoke direct execute ────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = '' as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ── 5. RLS performance: evaluate auth.uid() once per query, not per row ───────
-- (advisor 0003_auth_rls_initplan). Access logic is unchanged; see the
-- per-table *.sql files for the full set of recreated policies.

-- ── 6. Covering indexes for foreign keys (advisor 0001) ──────────────────────
create index if not exists agent_actions_conversation_id_idx on agent_actions (conversation_id);
create index if not exists agent_messages_user_id_idx on agent_messages (user_id);
create index if not exists analyses_user_id_idx on analyses (user_id);
create index if not exists clipflow_clips_user_id_idx on clipflow_clips (user_id);
create index if not exists clipflow_jobs_project_id_idx on clipflow_jobs (project_id);
create index if not exists clipflow_jobs_user_id_idx on clipflow_jobs (user_id);
create index if not exists clipflow_posts_user_id_idx on clipflow_posts (user_id);
create index if not exists editor_projects_user_id_idx on editor_projects (user_id);
create index if not exists feedback_points_analysis_id_idx on feedback_points (analysis_id);
create index if not exists script_projects_user_id_idx on script_projects (user_id);
create index if not exists timeline_projects_user_id_idx on timeline_projects (user_id);

-- ── 7. Manual follow-ups (cannot be done in SQL) ─────────────────────────────
-- * Enable "Leaked password protection" in Auth → Settings (checks HaveIBeenPwned).
-- * Set ADMIN_ACTION_SECRET and CLIPFLOW_TOKEN_SECRET in the environment.
