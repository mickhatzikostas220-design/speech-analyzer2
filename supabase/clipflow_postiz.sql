-- ClipFlow — per-user Postiz credentials (bring-your-own Postiz workspace).
--
-- Lets each speaker publish through *their own* Postiz account instead of a
-- single shared POSTIZ_API_KEY: they paste their Postiz API key once and clips
-- post to the channels connected in their Postiz workspace. The key is stored
-- encrypted (AES-256-GCM, see lib/clipflow/crypto.ts) and never returned to the
-- browser; RLS additionally limits every row to its owner.
--
-- Additive and idempotent (IF NOT EXISTS) — safe to run on top of the existing
-- ClipFlow tables. Run in the Supabase SQL editor (Dashboard > SQL Editor).

create table if not exists clipflow_postiz_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  encrypted_api_key text not null,
  -- Optional self-hosted Postiz API base (e.g. https://postiz.example.com/public/v1).
  -- Null means the hosted default (https://api.postiz.com/public/v1).
  api_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id)
);

alter table clipflow_postiz_accounts enable row level security;

-- The encrypted key is decrypted only server-side; RLS keeps each row private to
-- its owner on top of that.
drop policy if exists "Users manage own postiz account" on clipflow_postiz_accounts;
create policy "Users manage own postiz account" on clipflow_postiz_accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
