-- Tool Runs — durable history for the "generate and it's gone" tools.
-- Run this in the Supabase SQL editor after schema.sql.
--
-- The heavy tools (analyses, clipflow, keynotes, editor) already persist their
-- work in their own tables. The lighter "generate a result" tools — the SEO/AEO
-- advisor, Content Ideas, Stage Finder, and Compare — used to throw their output
-- away the moment you navigated off. This one generic table gives every such tool
-- a per-user history so results survive leaving/returning and are the same on any
-- device. The client also keeps a localStorage copy for instant repaint; this is
-- the durable, cross-device source of truth.

create table if not exists tool_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  -- Which tool produced this: 'seo' | 'content_ideas' | 'stagefinder' | 'compare'.
  -- Not constrained at the DB level so adding a new tool never needs a migration.
  tool text not null,
  -- Short human label for the history list (e.g. the scanned URL or the topic).
  title text,
  -- The request that produced the result (so a run can be re-opened with context).
  input jsonb,
  -- The generated result itself.
  output jsonb,
  created_at timestamptz default now()
);

create index if not exists tool_runs_user_tool_idx
  on tool_runs (user_id, tool, created_at desc);

-- Row-level security: owners see/manage only their own runs. Server routes use the
-- cookie-scoped client and also filter by user_id; this is defense in depth.
alter table tool_runs enable row level security;

create policy "own tool_runs" on tool_runs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
