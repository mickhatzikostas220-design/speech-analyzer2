-- ============================================================================
-- SECURITY FIXES — run this once in the Supabase SQL editor
-- ============================================================================
-- These close row-level-security / storage-policy gaps found in a security
-- review. They are additive and idempotent (safe to re-run). NOTHING here was
-- applied automatically — a code review agent can't reach the live database, so
-- YOU need to paste this into Dashboard > SQL Editor > New query and run it.
--
-- Ordered by severity. Read the comment above each block before running; two of
-- them (F2, F4) depend on how your server writes to the database, so verify the
-- note before relying on them.
-- ============================================================================


-- ─── F1 (HIGH) ──────────────────────────────────────────────────────────────
-- Any logged-in user could read EVERY user's private speech recordings.
--
-- The `speeches` bucket is private, and there's a correct per-user read policy
-- ("Users read own speeches") scoped to their own folder. But a second policy,
-- "Service reads speeches", grants SELECT on the whole bucket with no user
-- check and no role restriction — so it defaults to `public` (anon +
-- authenticated) and OR's away the ownership check. The service role bypasses
-- RLS entirely and never needed this policy; it only ever leaked access to
-- ordinary users. Drop it. Server routes that sign/read cross-user objects
-- already use the service-role key, which still works.
drop policy if exists "Service reads speeches" on storage.objects;


-- ─── F2 (MEDIUM) ────────────────────────────────────────────────────────────
-- Any user could insert rows onto ANOTHER user's analysis.
--
-- `feedback_points` / `engagement_timeline` have INSERT policies with
-- `with check (true)`. As with F1, the intended writer is the service role
-- (the analysis worker), which bypasses RLS — so `true` only ever granted the
-- INSERT to anon/authenticated. A user could plant fabricated feedback text on
-- someone else's analysis (that text is shown back to the owner as their AI
-- results). Replace the blanket policies with ownership-scoped ones.
--
-- VERIFY FIRST: confirm your analysis worker (tribe-server) writes these rows
-- with the SERVICE ROLE key. It does in the current code, and the service role
-- bypasses RLS, so tightening these policies won't affect it. If any client
-- ever inserts these rows directly with a user's anon key, the scoped policy
-- below still allows it for the owner.
drop policy if exists "Service inserts feedback" on feedback_points;
create policy "Users insert own feedback" on feedback_points for insert with check (
  analysis_id in (select id from analyses where user_id = auth.uid())
);

drop policy if exists "Service inserts timeline" on engagement_timeline;
create policy "Users insert own timeline" on engagement_timeline for insert with check (
  analysis_id in (select id from analyses where user_id = auth.uid())
);


-- ─── F3 (MEDIUM) ────────────────────────────────────────────────────────────
-- SECURITY DEFINER function with a mutable search_path (privilege-escalation
-- class flagged by the Supabase linter). Pin the search_path. Body unchanged.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;


-- ─── F4 (MEDIUM) ────────────────────────────────────────────────────────────
-- The billing-column guard doesn't check who the caller actually is.
--
-- `protect_billing_columns()` is SECURITY DEFINER and tests
-- `current_user <> 'service_role'`. Inside a DEFINER function, `current_user`
-- is the function OWNER (e.g. postgres), not the caller — so the check never
-- evaluates the real caller. Running it as SECURITY INVOKER makes `current_user`
-- the actual role issuing the UPDATE, which is what the guard needs. Also pin
-- the search_path.
--
-- VERIFY AFTER RUNNING: from an authenticated (non-service) session, attempt to
-- UPDATE profiles.plan for your own row — it MUST raise the "billing fields ..."
-- exception. Then confirm the Stripe webhook / admin grant-plan (both service
-- role) can still change plans. If billing updates start failing, revert this
-- block; it means your function/webhook run under a role this check doesn't
-- expect, and the role name in the check needs adjusting.
create or replace function public.protect_billing_columns()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if current_user <> 'service_role' and (
       new.plan is distinct from old.plan
    or new.stripe_customer_id is distinct from old.stripe_customer_id
    or new.stripe_subscription_id is distinct from old.stripe_subscription_id
  ) then
    raise exception 'billing fields (plan, stripe_*) can only be changed by the service role';
  end if;
  return new;
end;
$$;


-- ─── F5 (LOW, optional hardening) ───────────────────────────────────────────
-- Owners can read their own encrypted secrets/tokens over the anon key.
--
-- agent_api_keys, agent_connections, clipflow_connections, clipflow_secrets use
-- `for all using (auth.uid() = user_id)`, which includes SELECT. Cross-user
-- access is correctly blocked, but a user's own browser session can read their
-- own ciphertext columns — which the code comments say should "never leave the
-- server." The values are AES-256-GCM ciphertext and the key is server-only, so
-- this is defense-in-depth, not an exploitable hole. If you want to close it,
-- stop granting client SELECT on those tables and let the server read them via
-- the service role. Left as a documented recommendation rather than a policy
-- change here, because splitting the `for all` policy needs care not to break
-- the client flows (settings pages) that list a user's own keys by `hint`.
