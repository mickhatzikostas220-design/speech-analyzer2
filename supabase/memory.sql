-- User Memory — schema
-- Run this in the Supabase SQL editor (Dashboard > SQL Editor > New query)
-- after schema.sql. This is what makes the app feel personal: durable facts the
-- user tells us (their goals, upcoming talks, style, preferences) are stored per
-- row and fed back into every AI feature as context.
--
-- Free for all tiers. Captured two ways: explicitly ("remember that…") and
-- automatically (a cheap background extractor reads finished interactions and
-- saves durable facts). Users can view / edit / delete every item and turn the
-- whole thing off — see components/settings/MemorySettings.tsx.

-- One remembered fact = one row.
create table if not exists user_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  content text not null,
  -- Loose bucket for display/filtering: 'goal' | 'preference' | 'fact' |
  -- 'event' | 'style' | 'other'. Not constrained at the DB level on purpose so
  -- the auto-extractor can never fail an insert on an unexpected label; the app
  -- normalizes it (see lib/memory/store.ts).
  category text,
  -- How it got here: 'explicit' (the user asked) or 'auto' (extracted for them).
  source text not null default 'explicit' check (source in ('auto', 'explicit')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists user_memories_user_idx
  on user_memories (user_id, created_at desc);

-- Master on/off switch for the whole feature, per user. Default on so the app
-- feels personal from day one; users can flip it off in Settings → Memory.
alter table profiles add column if not exists memory_enabled boolean default true;

-- Row-level security ------------------------------------------------------
-- Owners can see/manage only their own memories. Server routes use the service
-- role (which bypasses RLS) and always filter by user_id; this policy is
-- defense-in-depth for any anon-key access.
alter table user_memories enable row level security;

create policy "own user_memories" on user_memories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
