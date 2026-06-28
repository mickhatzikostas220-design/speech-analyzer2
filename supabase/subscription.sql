-- Subscription plan on profiles. Run in the Supabase SQL editor.
-- Tiers: free (default), core (Core Premium), full (Full Premium).

alter table profiles
  add column if not exists plan text not null default 'free'
    check (plan in ('free', 'core', 'full'));

-- Optional: track the Stripe customer/subscription once billing is connected.
alter table profiles
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;
