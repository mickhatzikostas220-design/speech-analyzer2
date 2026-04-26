-- Run this in the Supabase SQL editor (Dashboard > SQL Editor > New query)

-- Profiles (auto-created on signup via trigger below)
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  created_at timestamptz default now()
);

-- Analyses
create table if not exists analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  title text not null,
  file_path text not null,
  file_type text not null check (file_type in ('video', 'audio')),
  transcript text,
  overall_score integer check (overall_score between 0 and 100),
  duration_seconds float,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'complete', 'error')),
  error_message text,
  created_at timestamptz default now()
);

-- Feedback points with exact timecodes
create table if not exists feedback_points (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid references analyses(id) on delete cascade not null,
  timecode_ms integer not null,
  timecode_end_ms integer not null,
  engagement_score integer not null check (engagement_score between 0 and 100),
  feedback_text text not null,
  improvement_suggestion text not null,
  severity text not null check (severity in ('low', 'medium', 'high')),
  created_at timestamptz default now()
);

-- Engagement timeline (one row per second of analysis)
create table if not exists engagement_timeline (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid references analyses(id) on delete cascade not null,
  timecode_ms integer not null,
  score integer not null check (score between 0 and 100)
);

create index if not exists engagement_timeline_analysis_id_idx on engagement_timeline (analysis_id, timecode_ms);

-- Row-level security
alter table profiles enable row level security;
alter table analyses enable row level security;
alter table feedback_points enable row level security;
alter table engagement_timeline enable row level security;

-- Profiles policies
create policy "Users view own profile" on profiles for select using (auth.uid() = id);
create policy "Users update own profile" on profiles for update using (auth.uid() = id);

-- Analyses policies
create policy "Users view own analyses" on analyses for select using (auth.uid() = user_id);
create policy "Users insert own analyses" on analyses for insert with check (auth.uid() = user_id);
create policy "Users update own analyses" on analyses for update using (auth.uid() = user_id);
create policy "Users delete own analyses" on analyses for delete using (auth.uid() = user_id);

-- Feedback points — readable by owner, writable by service role (API routes)
create policy "Users view own feedback" on feedback_points for select using (
  analysis_id in (select id from analyses where user_id = auth.uid())
);
create policy "Service inserts feedback" on feedback_points for insert with check (true);

-- Engagement timeline
create policy "Users view own timeline" on engagement_timeline for select using (
  analysis_id in (select id from analyses where user_id = auth.uid())
);
create policy "Service inserts timeline" on engagement_timeline for insert with check (true);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Storage bucket (run separately if bucket doesn't exist yet)
-- insert into storage.buckets (id, name, public) values ('speeches', 'speeches', false);

create policy "Users upload own speeches" on storage.objects for insert with check (
  bucket_id = 'speeches' and auth.uid()::text = (storage.foldername(name))[1]
);
create policy "Users read own speeches" on storage.objects for select using (
  bucket_id = 'speeches' and auth.uid()::text = (storage.foldername(name))[1]
);
create policy "Users delete own speeches" on storage.objects for delete using (
  bucket_id = 'speeches' and auth.uid()::text = (storage.foldername(name))[1]
);
create policy "Service reads speeches" on storage.objects for select using (
  bucket_id = 'speeches'
);
