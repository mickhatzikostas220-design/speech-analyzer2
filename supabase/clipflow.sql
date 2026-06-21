-- ClipFlow — long-form → short-form clipping, captioning, and multi-platform publishing.
-- Run this in the Supabase SQL editor (Dashboard > SQL Editor > New query).
-- Everything is additive and idempotent (IF NOT EXISTS), so it is safe to re-run
-- and will not touch any existing Orator / Editor tables.

-- ── Projects: one row per submitted YouTube video or channel video ──────────
create table if not exists clipflow_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  source_url text not null,
  source_type text not null default 'video' check (source_type in ('video', 'channel')),
  youtube_id text,
  title text,
  description text,
  channel_title text,
  duration_seconds float,
  thumbnail_url text,
  transcript jsonb,
  -- User preferences for the kinds of clips to surface: { tone, length, notes }.
  preferences jsonb,
  status text not null default 'queued'
    check (status in ('queued', 'fetching', 'transcribing', 'analyzing', 'clipping', 'ready', 'error')),
  progress integer not null default 0 check (progress between 0 and 100),
  error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists clipflow_projects_user_idx on clipflow_projects (user_id, created_at desc);

-- Backfill the preferences column on databases created before it existed.
alter table clipflow_projects add column if not exists preferences jsonb;

-- ── Clips: the short-form vertical clips generated from a project ────────────
create table if not exists clipflow_clips (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references clipflow_projects(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  position integer not null default 0,
  start_seconds float not null,
  end_seconds float not null,
  title text,
  caption text,
  description text,
  hashtags jsonb default '{}'::jsonb,
  transcript_text text,
  score float,
  reason text,
  caption_style text default 'opus' check (caption_style in ('opus', 'karaoke', 'minimal')),
  file_path text,
  thumbnail_url text,
  status text not null default 'draft'
    check (status in ('draft', 'rendering', 'ready', 'error')),
  error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists clipflow_clips_project_idx on clipflow_clips (project_id, position);

-- ── Platform connections: encrypted OAuth tokens, never returned to client ──
-- Mirrors the existing agent_connections table convention.
create table if not exists clipflow_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  platform text not null check (platform in ('instagram', 'tiktok', 'youtube', 'twitter')),
  account_name text,
  account_id text,
  scopes text,
  encrypted_access_token text,
  encrypted_refresh_token text,
  token_expires_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, platform)
);

-- ── Posts: per-clip, per-platform publish records ───────────────────────────
create table if not exists clipflow_posts (
  id uuid primary key default gen_random_uuid(),
  clip_id uuid references clipflow_clips(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  platform text not null check (platform in ('instagram', 'tiktok', 'youtube', 'twitter')),
  status text not null default 'queued'
    check (status in ('queued', 'scheduled', 'posting', 'posted', 'failed')),
  scheduled_at timestamptz,
  posted_at timestamptz,
  external_url text,
  external_id text,
  error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists clipflow_posts_clip_idx on clipflow_posts (clip_id);

-- ── Jobs: lightweight Postgres-backed work queue (Bull-style, serverless-safe)
create table if not exists clipflow_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references clipflow_projects(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade not null,
  type text not null check (type in ('process_project', 'render_clip', 'publish_post')),
  payload jsonb default '{}'::jsonb,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'done', 'failed')),
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  last_error text,
  run_after timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists clipflow_jobs_queue_idx on clipflow_jobs (status, run_after);

-- ── Row-level security ──────────────────────────────────────────────────────
alter table clipflow_projects enable row level security;
alter table clipflow_clips enable row level security;
alter table clipflow_connections enable row level security;
alter table clipflow_posts enable row level security;
alter table clipflow_jobs enable row level security;

-- Projects
drop policy if exists "Users manage own clipflow projects" on clipflow_projects;
create policy "Users manage own clipflow projects" on clipflow_projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Clips
drop policy if exists "Users manage own clipflow clips" on clipflow_clips;
create policy "Users manage own clipflow clips" on clipflow_clips
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Connections (tokens are encrypted at rest and only ever read server-side)
drop policy if exists "Users manage own clipflow connections" on clipflow_connections;
create policy "Users manage own clipflow connections" on clipflow_connections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Posts
drop policy if exists "Users manage own clipflow posts" on clipflow_posts;
create policy "Users manage own clipflow posts" on clipflow_posts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Jobs
drop policy if exists "Users manage own clipflow jobs" on clipflow_jobs;
create policy "Users manage own clipflow jobs" on clipflow_jobs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
