-- Tester demo account
-- =====================
-- A single fixed account (tester67@speaker-hub.com) that is experienced as a
-- brand-new user on every sign-in. On login the app calls /api/tester/reset,
-- which runs reset_tester_account() below to wipe the account's data and reset
-- its profile back to a fresh, free-tier, un-onboarded state.
--
-- This file documents what was applied to the database. The account row itself
-- was created directly in prod (see the "create the account" block) because the
-- password must be hashed with pgcrypto and the email pre-confirmed.
--
-- NOTE: the real password is intentionally NOT stored here. Replace the
-- '<TESTER_PASSWORD>' placeholder below with the actual value before running
-- this block manually — do not commit the real password to the repo.

-- ---------------------------------------------------------------------------
-- 1. The account (pre-verified so it never needs an email confirmation step).
--    Idempotent: only inserts if the email doesn't already exist.
-- ---------------------------------------------------------------------------
do $$
declare
  uid uuid := gen_random_uuid();
begin
  if not exists (select 1 from auth.users where email = 'tester67@speaker-hub.com') then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      -- GoTrue errors on login if these token columns are NULL, so set them to ''
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token,
      is_sso_user, is_anonymous
    ) values (
      '00000000-0000-0000-0000-000000000000',
      uid, 'authenticated', 'authenticated',
      'tester67@speaker-hub.com',
      crypt('<TESTER_PASSWORD>', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      '', '', '', '', '', '', '', '',
      false, false
    );

    -- email/password login needs a matching identity row
    insert into auth.identities (
      provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      uid::text, uid,
      jsonb_build_object('sub', uid::text, 'email', 'tester67@speaker-hub.com',
                         'email_verified', true, 'phone_verified', false),
      'email', now(), now(), now()
    );
    -- public.profiles row is created automatically by the handle_new_user trigger.
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The reset function. SECURITY DEFINER (bypasses RLS); EXECUTE granted to
--    service_role only, so it can never be called from a browser anon key.
-- ---------------------------------------------------------------------------
create or replace function public.reset_tester_account(uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- analyses + their children (feedback_points / engagement_timeline key on analysis_id)
  delete from feedback_points where analysis_id in (select id from analyses where user_id = uid);
  delete from engagement_timeline where analysis_id in (select id from analyses where user_id = uid);
  delete from analyses where user_id = uid;

  -- agent (messages/actions -> conversations -> settings/keys/connections)
  delete from agent_messages where user_id = uid;
  delete from agent_actions where user_id = uid;
  delete from agent_conversations where user_id = uid;
  delete from agent_api_keys where user_id = uid;
  delete from agent_connections where user_id = uid;
  delete from agent_settings where user_id = uid;

  -- clipflow (posts -> clips -> jobs -> projects, plus connections/keys/secrets)
  delete from clipflow_posts where user_id = uid;
  delete from clipflow_clips where user_id = uid;
  delete from clipflow_jobs where user_id = uid;
  delete from clipflow_projects where user_id = uid;
  delete from clipflow_connections where user_id = uid;
  delete from clipflow_uploadpost_keys where user_id = uid;
  delete from clipflow_secrets where user_id = uid;

  -- keynotes (variants -> keynotes)
  delete from keynote_variants where user_id = uid;
  delete from keynotes where user_id = uid;

  -- editor / scripts / timelines
  delete from editor_projects where user_id = uid;
  delete from script_projects where user_id = uid;
  delete from timeline_projects where user_id = uid;

  -- gigs / bookings
  delete from gigs where user_id = uid;
  delete from bookings where user_id = uid;

  -- seo/aeo + coaching tips
  delete from aeo_tips where user_id = uid;
  delete from aeo_settings where user_id = uid;
  delete from user_tips where user_id = uid;

  -- reset the profile itself back to a brand-new, free, un-onboarded state
  update profiles set
    display_name = null,
    website_url = null,
    brand = null,
    onboarded_at = null,
    calendar_ics_url = null,
    slug = null,
    plan = 'free',
    stripe_customer_id = null,
    stripe_subscription_id = null,
    plan_status = null,
    plan_renews_at = null,
    analysis_count = 0,
    analysis_reset_date = null,
    priority_support = false,
    payment_failed = false,
    seo_last_used_at = null,
    is_subscribed = false,
    subscription_status = null,
    subscription_current_period_end = null,
    favorite_tools = '{}'
  where id = uid;
end;
$$;

revoke all on function public.reset_tester_account(uuid) from public;
revoke all on function public.reset_tester_account(uuid) from anon;
revoke all on function public.reset_tester_account(uuid) from authenticated;
grant execute on function public.reset_tester_account(uuid) to service_role;
