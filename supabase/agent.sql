-- Personal AI Agent — schema
-- Run this in the Supabase SQL editor (Dashboard > SQL Editor > New query)
-- after schema.sql. All tables are per-user with row-level security.

-- Per-user agent settings (provider + model + optional custom system prompt)
create table if not exists agent_settings (
  user_id uuid primary key references profiles(id) on delete cascade,
  provider text not null default 'anthropic' check (provider in ('anthropic', 'openai')),
  model text not null default 'claude-sonnet-4-6',
  system_prompt text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Bring-your-own-key API keys, encrypted at rest (AES-256-GCM via APP_ENCRYPTION_KEY).
-- The ciphertext never leaves the server; the client only ever sees key_hint.
create table if not exists agent_api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  provider text not null check (provider in ('anthropic', 'openai')),
  encrypted_key text not null,
  key_hint text not null,
  created_at timestamptz default now(),
  unique (user_id, provider)
);

-- Connected apps (OAuth). Tokens are encrypted at rest. autonomy controls what
-- the agent is allowed to do with this connection.
create table if not exists agent_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  provider text not null check (provider in ('google')),
  account_email text,
  scopes text,
  encrypted_access_token text,
  encrypted_refresh_token text,
  token_expires_at timestamptz,
  autonomy text not null default 'read_only'
    check (autonomy in ('read_only', 'draft_confirm', 'act_directly')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, provider, account_email)
);

-- Conversations
create table if not exists agent_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  title text not null default 'New chat',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists agent_conversations_user_idx
  on agent_conversations (user_id, updated_at desc);

-- Messages within a conversation
create table if not exists agent_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references agent_conversations(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null default '',
  tool_calls jsonb,
  created_at timestamptz default now()
);

create index if not exists agent_messages_conversation_idx
  on agent_messages (conversation_id, created_at);

-- Audit log of every action the agent took on a connected app (transparency).
create table if not exists agent_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  conversation_id uuid references agent_conversations(id) on delete set null,
  tool text not null,
  args jsonb,
  status text not null default 'executed'
    check (status in ('executed', 'failed')),
  result text,
  created_at timestamptz default now()
);

create index if not exists agent_actions_user_idx
  on agent_actions (user_id, created_at desc);

-- Row-level security ------------------------------------------------------
alter table agent_settings enable row level security;
alter table agent_api_keys enable row level security;
alter table agent_connections enable row level security;
alter table agent_conversations enable row level security;
alter table agent_messages enable row level security;
alter table agent_actions enable row level security;

-- Owners can see/manage their own rows. Server routes use the service role
-- (which bypasses RLS) and always filter by user_id; these policies are
-- defense-in-depth for any anon-key access.
create policy "own agent_settings" on agent_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own agent_api_keys" on agent_api_keys
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own agent_connections" on agent_connections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own agent_conversations" on agent_conversations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own agent_messages" on agent_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own agent_actions" on agent_actions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
