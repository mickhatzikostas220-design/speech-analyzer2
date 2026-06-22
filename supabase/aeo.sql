-- AEO Coach — Answer Engine Optimization tips
-- Run this in the Supabase SQL editor (Dashboard > SQL Editor > New query)
-- after schema.sql. All tables are per-user with row-level security.

-- Billing plan on the profile. 'free' gets one AEO tip a week; 'pro' is unlimited
-- and can pick their own delivery cadence. (Billing provider is wired separately;
-- this column is the single source of truth the app gates features on.)
alter table profiles
  add column if not exists plan text not null default 'free'
    check (plan in ('free', 'pro'));

-- Per-user AEO delivery settings.
create table if not exists aeo_settings (
  user_id uuid primary key references profiles(id) on delete cascade,
  -- How often a new tip is released automatically. Free users are always weekly;
  -- pro users may pick any cadence.
  cadence text not null default 'weekly'
    check (cadence in ('daily', 'weekly', 'biweekly', 'monthly')),
  last_released_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Tips that have been released to a user. tip_key references the static catalog
-- in lib/aeo/catalog.ts. track is the implementation path the user chose to follow.
create table if not exists aeo_tips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  tip_key text not null,
  status text not null default 'active'
    check (status in ('active', 'completed', 'skipped')),
  track text check (track in ('wix', 'other', 'code')),
  released_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, tip_key)
);

create index if not exists aeo_tips_user_idx on aeo_tips (user_id, released_at desc);

-- Row-level security
alter table aeo_settings enable row level security;
alter table aeo_tips enable row level security;

create policy "Users view own aeo settings" on aeo_settings for select using (auth.uid() = user_id);
create policy "Users upsert own aeo settings" on aeo_settings for insert with check (auth.uid() = user_id);
create policy "Users update own aeo settings" on aeo_settings for update using (auth.uid() = user_id);

create policy "Users view own aeo tips" on aeo_tips for select using (auth.uid() = user_id);
create policy "Users insert own aeo tips" on aeo_tips for insert with check (auth.uid() = user_id);
create policy "Users update own aeo tips" on aeo_tips for update using (auth.uid() = user_id);
create policy "Users delete own aeo tips" on aeo_tips for delete using (auth.uid() = user_id);
