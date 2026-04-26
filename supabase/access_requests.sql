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

-- Anyone can submit a request (no auth required)
create policy "Anyone can submit request" on access_requests
  for insert with check (true);

-- Only service role can read and update (all admin actions go through server-side API)
