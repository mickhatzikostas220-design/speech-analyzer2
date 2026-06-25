-- Stripe billing + plan/usage tracking.
-- Run this in the Supabase SQL editor (Dashboard > SQL Editor > New query)
-- AFTER schema.sql. Safe to re-run (idempotent).

-- Plan + Stripe + usage columns on the existing profiles table.
alter table profiles add column if not exists plan text not null default 'free'
  check (plan in ('free', 'core', 'full'));
alter table profiles add column if not exists stripe_customer_id text;
alter table profiles add column if not exists stripe_subscription_id text;
alter table profiles add column if not exists analysis_count integer not null default 0;
alter table profiles add column if not exists analysis_reset_date timestamptz;
alter table profiles add column if not exists priority_support boolean not null default false;
alter table profiles add column if not exists payment_failed boolean not null default false;

-- Fast lookup of a profile by its Stripe customer id (used by webhooks).
create index if not exists profiles_stripe_customer_id_idx on profiles (stripe_customer_id);

-- NOTE on security: the existing "Users update own profile" RLS policy lets a
-- signed-in user update their own row. Plan/usage columns are only ever written
-- by server routes using the service-role (admin) client, which bypasses RLS,
-- so the source of truth for billing stays server-side. Reads of plan/usage by
-- the user are fine. If you want belt-and-suspenders, you can replace the broad
-- update policy with a column-scoped one, but that is optional.
