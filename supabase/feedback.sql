-- Feedback — early-speaker criticism and feature requests collected during the
-- free beta. One row per submission. Owners can create and read their own; the
-- team reviews everything through the service role (which bypasses RLS).

create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  email text,
  -- What kind of note this is: 'feature' | 'criticism' | 'bug' | 'other'.
  -- Not constrained at the DB level so new categories never need a migration.
  category text not null default 'other',
  message text not null,
  created_at timestamptz default now()
);

create index if not exists feedback_created_idx on feedback (created_at desc);

-- Row-level security: owners submit and see only their own notes. Server routes
-- use the cookie-scoped client and set user_id from the session; this is defense
-- in depth. The team reads all feedback via the service-role key.
alter table feedback enable row level security;

create policy "insert own feedback" on feedback
  for insert with check (auth.uid() = user_id);

create policy "read own feedback" on feedback
  for select using (auth.uid() = user_id);
