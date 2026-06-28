-- Subscription plan on profiles. Run in the Supabase SQL editor.
-- Tiers: free (default), core (Core Premium), full (Full Premium).

alter table profiles
  add column if not exists plan text not null default 'free'
    check (plan in ('free', 'core', 'full'));

-- Track the Stripe customer/subscription.
alter table profiles
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

-- SECURITY: RLS lets a user update their own profile row, so without protection
-- a user could grant themselves a paid plan straight from the browser. A
-- column-level REVOKE does NOT work here — Supabase grants `authenticated`
-- table-level UPDATE on profiles, which shadows any per-column revoke. Enforce
-- it with a trigger instead: only the service role (the Stripe webhook / admin
-- client) may change the billing columns. Other columns (brand, slug, …) stay
-- user-editable.
create or replace function public.protect_billing_columns()
returns trigger
language plpgsql
security definer
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

drop trigger if exists protect_billing_columns on profiles;
create trigger protect_billing_columns
  before update on profiles
  for each row execute procedure public.protect_billing_columns();
