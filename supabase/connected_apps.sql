-- Connected app integrations — run after agent.sql
-- Extends agent_connections to support Microsoft and adds a table for API-key-based apps.

-- Allow Microsoft as a provider (Google was the only one before)
alter table agent_connections drop constraint if exists agent_connections_provider_check;
alter table agent_connections add constraint agent_connections_provider_check
  check (provider in ('google', 'microsoft'));

-- API keys for third-party services (Twitter, Instagram, LinkedIn, etc.)
-- Keys are AES-256-GCM encrypted at rest; client only ever sees key_hint (last 4 chars).
create table if not exists connected_app_keys (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references profiles(id) on delete cascade not null,
  app_id     text not null,
  encrypted_key text not null,
  key_hint   text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, app_id)
);

alter table connected_app_keys enable row level security;

create policy "own connected_app_keys" on connected_app_keys
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
