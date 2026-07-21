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

-- No RLS policies by design. The public submit form (POST /api/request-access)
-- inserts via the service-role client, which bypasses RLS, and all admin
-- reads/updates are server-side too. With RLS enabled and no policy, the anon
-- and authenticated roles get NO direct access to this table — which is what we
-- want, since it holds people's names/emails/reasons. Do not add a broad
-- `for insert with check (true)` policy: it would let anyone write rows
-- directly, bypassing the API's rate limiting and duplicate checks.
