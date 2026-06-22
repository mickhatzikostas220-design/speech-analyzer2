-- Personal AI Agent — Composio integration (connect 250+ apps)
-- Run this in the Supabase SQL editor AFTER agent.sql. All additive + RLS.
--
-- Composio is bring-your-own-key: each speaker pastes their own Composio API
-- key (validated + encrypted at rest, reusing agent_api_keys) and connects
-- their own third-party accounts through Composio's hosted OAuth. Composio
-- stores the OAuth tokens; we only keep a lightweight pointer per connected
-- toolkit plus the autonomy level the user granted it.

-- 1) Allow the Composio key to live alongside the LLM provider keys.
--    (agent_api_keys originally constrained provider to the LLM providers only.)
alter table agent_api_keys
  drop constraint if exists agent_api_keys_provider_check;
alter table agent_api_keys
  add constraint agent_api_keys_provider_check
  check (provider in ('anthropic', 'openai', 'composio'));

-- 2) One row per Composio toolkit a user has connected (e.g. gmail, slack,
--    notion, github). connected_account_id is Composio's id for that link;
--    autonomy gates which of the toolkit's tools the agent may use, exactly
--    like agent_connections does for the built-in Gmail integration.
create table if not exists agent_composio_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  toolkit text not null,
  connected_account_id text not null,
  account_label text,
  autonomy text not null default 'read_only'
    check (autonomy in ('read_only', 'draft_confirm', 'act_directly')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, toolkit)
);

create index if not exists agent_composio_connections_user_idx
  on agent_composio_connections (user_id, created_at);

alter table agent_composio_connections enable row level security;

-- Owners manage their own rows. Server routes use the service role (which
-- bypasses RLS) and always filter by user_id; this is defense-in-depth.
create policy "own agent_composio_connections" on agent_composio_connections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
