-- Supabase security & performance hardening
-- ==========================================
-- Generated from `supabase get_advisors` (security + performance) on the live
-- project. REVIEW before running — apply in the Supabase SQL editor. Nothing
-- here changes app behavior for signed-in users; it tightens role scoping and
-- adds a missing index.
--
-- Background: every "own row" policy below already filters by `auth.uid() = user_id`,
-- so anonymous (logged-out) callers already get zero rows. But the policies are
-- attached to the broad `public` role, which trips Supabase's
-- `auth_allow_anonymous_sign_ins` advisor. Re-scoping them to `authenticated`
-- makes intent explicit and clears the warnings. Safe because no app flow reads
-- these tables while logged out.

begin;

-- 1) Missing index on a foreign key (performance advisor 0001) -----------------
create index if not exists feedback_user_id_idx on public.feedback (user_id);

-- 2) Restrict "own row" RLS policies to authenticated users --------------------
--    (security advisor 0012 — Anonymous Access Policies)
alter policy "Users view own aeo settings"        on public.aeo_settings            to authenticated;
alter policy "Users update own aeo settings"      on public.aeo_settings            to authenticated;
alter policy "Users view own aeo tips"            on public.aeo_tips                to authenticated;
alter policy "Users update own aeo tips"          on public.aeo_tips                to authenticated;
alter policy "Users delete own aeo tips"          on public.aeo_tips                to authenticated;
alter policy "own agent_actions"                  on public.agent_actions           to authenticated;
alter policy "own agent_api_keys"                 on public.agent_api_keys          to authenticated;
alter policy "own agent_connections"              on public.agent_connections       to authenticated;
alter policy "own agent_conversations"            on public.agent_conversations     to authenticated;
alter policy "own agent_messages"                 on public.agent_messages          to authenticated;
alter policy "own agent_settings"                 on public.agent_settings          to authenticated;
alter policy "Users view own analyses"            on public.analyses                to authenticated;
alter policy "Users update own analyses"          on public.analyses                to authenticated;
alter policy "Users delete own analyses"          on public.analyses                to authenticated;
alter policy "Users view own bookings"            on public.bookings                to authenticated;
alter policy "Users update own bookings"          on public.bookings                to authenticated;
alter policy "Users delete own bookings"          on public.bookings                to authenticated;
alter policy "Users manage own clipflow clips"        on public.clipflow_clips           to authenticated;
alter policy "Users manage own clipflow connections"  on public.clipflow_connections     to authenticated;
alter policy "Users manage own clipflow jobs"         on public.clipflow_jobs            to authenticated;
alter policy "Users manage own clipflow posts"        on public.clipflow_posts           to authenticated;
alter policy "Users manage own clipflow projects"     on public.clipflow_projects        to authenticated;
alter policy "Users manage own clipflow secrets"      on public.clipflow_secrets         to authenticated;
alter policy "Users manage own clipflow uploadpost key" on public.clipflow_uploadpost_keys to authenticated;
alter policy "Users manage own editor projects"   on public.editor_projects         to authenticated;
alter policy "Users view own timeline"            on public.engagement_timeline     to authenticated;
alter policy "Users delete own timeline"          on public.engagement_timeline     to authenticated;
alter policy "read own feedback"                  on public.feedback                to authenticated;
alter policy "Users view own feedback"            on public.feedback_points         to authenticated;
alter policy "Users delete own feedback"          on public.feedback_points         to authenticated;
alter policy "Users view own gigs"                on public.gigs                    to authenticated;
alter policy "Users update own gigs"              on public.gigs                    to authenticated;
alter policy "Users delete own gigs"              on public.gigs                    to authenticated;
alter policy "Users manage own keynote variants"  on public.keynote_variants        to authenticated;
alter policy "Users manage own keynotes"          on public.keynotes                to authenticated;
alter policy "Users view own profile"             on public.profiles                to authenticated;
alter policy "Users update own profile"           on public.profiles                to authenticated;
alter policy "Users manage own script projects"   on public.script_projects         to authenticated;
alter policy "Users manage own timeline projects" on public.timeline_projects       to authenticated;
alter policy "own tool_runs"                      on public.tool_runs               to authenticated;
alter policy "own user_memories"                  on public.user_memories           to authenticated;
alter policy "Users manage own tips"              on public.user_tips               to authenticated;

commit;

-- 3) Not fixable in SQL — do these in the Supabase dashboard -------------------
-- • Enable "Leaked password protection" (Auth → Providers → Password): checks
--   new passwords against HaveIBeenPwned. Currently OFF (advisor
--   auth_leaked_password_protection).
-- • Confirm "Secure email change" is ON so a user can't switch their email to
--   the admin address without re-confirmation (admin authz is email-based).
--
-- 4) Informational — no action needed
-- • public.access_requests has RLS enabled with no policies: that is deny-all to
--   anon/authenticated by design; only the service-role API routes touch it.
-- • Performance advisor also flagged auth_rls_initplan (wrap auth.uid() in a
--   subselect) and some unused indexes. Low priority; revisit if these tables
--   grow large. See https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
