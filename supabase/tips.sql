-- Scheduled coaching tips for paid users. Run in the Supabase SQL editor.
-- tip_id references the static library in lib/tips/library.ts.

create table if not exists user_tips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  tip_id text not null,
  scheduled_for date,
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists user_tips_user_idx on user_tips (user_id, scheduled_for);

alter table user_tips enable row level security;

create policy "Users manage own tips" on user_tips
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
