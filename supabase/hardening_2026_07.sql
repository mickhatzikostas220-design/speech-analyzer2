-- Consolidated security hardening — run once in the Supabase SQL editor.
--
-- Every statement here is idempotent and safe to re-run. Production was
-- previously verified to already have the storage-policy fix (see
-- PRODUCTION_CHECKLIST.md §1), so on prod most of this is a no-op — the one
-- item that is genuinely NEW is the billing-trigger role check in §3, which is
-- currently broken and will silently block real Stripe/admin plan changes once
-- paywalls are switched on.
--
-- This file exists so the whole SQL-layer posture can be closed by running a
-- single script, instead of tracking it across several open pull requests.

-- ── 1. Storage: remove the over-broad "read the whole speeches bucket" policy ──
-- The `speeches` bucket is private, so RLS is the only gate. The three intended
-- policies scope read/write/delete to the owning user's folder. A stray
-- "Service reads speeches" policy granted SELECT on EVERY object in the bucket
-- to the public role group (anon + authenticated) — storage policies are OR'd,
-- so it silently overrode the per-user scoping and let any caller download any
-- user's private recordings. Server-side reads use the service-role client,
-- which bypasses RLS and never needed this policy.
drop policy if exists "Service reads speeches" on storage.objects;

-- ── 2. Scope the feedback / timeline INSERT policies to the owning analysis ────
-- These were `with check (true)`, which (because the service role bypasses RLS)
-- only ever applied to the anon/authenticated roles and let any signed-in user
-- inject fabricated feedback or engagement rows into ANOTHER user's analysis.
-- Scope the check to analyses the caller owns. The service role still bypasses
-- RLS, so the GPU result-writer is unaffected; a legitimate user-context write
-- keeps working because it targets their own analysis.
drop policy if exists "Service inserts feedback" on feedback_points;
create policy "Insert feedback for own analysis" on feedback_points
  for insert with check (
    analysis_id in (select id from analyses where user_id = auth.uid())
  );

drop policy if exists "Service inserts timeline" on engagement_timeline;
create policy "Insert timeline for own analysis" on engagement_timeline
  for insert with check (
    analysis_id in (select id from analyses where user_id = auth.uid())
  );

-- ── 3. Fix the billing-column protection trigger's role check (NEW) ───────────
-- The trigger is the only thing stopping a user from granting themselves a paid
-- plan straight from the browser (the profiles UPDATE policy permits changing
-- any column on their own row). The old guard tested `current_user`, but inside
-- a SECURITY DEFINER function `current_user` is the function OWNER (e.g.
-- postgres), never the calling session — so the check never matched
-- 'service_role'. Effect: it fails closed. It blocks the intended self-upgrade
-- (good) AND blocks the legitimate Stripe-webhook / admin plan update (bad),
-- because the Supabase service-role client reaches Postgres as role
-- `service_role` via PostgREST, not as the function owner.
--
-- The reliable signal is the JWT role claim, which PostgREST sets per request
-- and which SECURITY DEFINER does not rewrite. Pin search_path too (Supabase
-- "Function Search Path Mutable" advisory).
create or replace function public.protect_billing_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
       ''
     ) <> 'service_role'
     and (
          new.plan is distinct from old.plan
       or new.stripe_customer_id is distinct from old.stripe_customer_id
       or new.stripe_subscription_id is distinct from old.stripe_subscription_id
     ) then
    raise exception 'billing fields (plan, stripe_*) can only be changed by the service role';
  end if;
  return new;
end;
$$;

-- ── 4. Pin search_path on the remaining SECURITY DEFINER function ─────────────
-- handle_new_user runs on every signup. It already schema-qualifies public.*,
-- but pin search_path to satisfy the advisory and remove the mutable-path risk.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;
