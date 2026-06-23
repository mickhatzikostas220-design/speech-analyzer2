-- Billing — Stripe subscription state on the profile.
-- Run this in the Supabase SQL editor after aeo.sql.

alter table profiles
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists plan_status text,
  add column if not exists plan_renews_at timestamptz;

create unique index if not exists profiles_stripe_customer_idx
  on profiles (stripe_customer_id)
  where stripe_customer_id is not null;

-- Lock down billing columns. The "Users update own profile" RLS policy lets a
-- user update their own row — without this guard they could simply set plan='pro'
-- and skip payment. This trigger reverts any change to plan / billing columns
-- unless the change is made by the service role (the Stripe webhook), which is
-- the ONLY trusted path to grant Pro.
create or replace function public.guard_profile_billing()
returns trigger language plpgsql security definer
set search_path = '' as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    new.plan := old.plan;
    new.stripe_customer_id := old.stripe_customer_id;
    new.stripe_subscription_id := old.stripe_subscription_id;
    new.plan_status := old.plan_status;
    new.plan_renews_at := old.plan_renews_at;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_billing_trg on profiles;
create trigger guard_profile_billing_trg
  before update on profiles
  for each row execute function public.guard_profile_billing();
