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

-- Anyone can submit a request (no auth required), but only with status='pending'
-- so the REST API can't be used to insert a pre-'approved' row. The form omits
-- status and relies on the column default ('pending').
create policy "Anyone can submit request" on access_requests
  for insert with check (status = 'pending');

-- Only service role can read and update (all admin actions go through server-side API)
