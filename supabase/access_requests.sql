-- Run this in Supabase SQL Editor as a second migration

create table if not exists access_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  created_at timestamptz default now()
);

alter table access_requests enable row level security;

-- No policies on purpose: the public request form inserts through the
-- service-role client in /api/request-access (which rate-limits and validates),
-- and the service role bypasses RLS. An open anon insert policy would let bots
-- write straight to this table with the public anon key, skipping those checks.
-- Reads/updates also happen only through the admin API routes (service role).
