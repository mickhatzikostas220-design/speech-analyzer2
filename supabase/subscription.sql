-- Subscription plan on profiles. Run in the Supabase SQL editor.
-- Tiers: free (default), core (Core Premium), full (Full Premium).

alter table profiles
  add column if not exists plan text not null default 'free'
    check (plan in ('free', 'core', 'full'));

-- Track the Stripe customer/subscription.
alter table profiles
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

-- SECURITY: RLS lets a user update their own profile row, so without this a
-- user could grant themselves a paid plan straight from the browser. Revoke
-- column-level UPDATE on the billing fields from regular users — only the
-- service role (the Stripe webhook) may change them. Other profile columns
-- (brand, slug, …) stay user-editable.
revoke update (plan, stripe_customer_id, stripe_subscription_id) on profiles from authenticated;
