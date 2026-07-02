-- Keynote Tailoring tool. A speaker stores one master keynote description, then
-- generates industry-specific versions that keep the same tone and core idea and
-- only re-frame the examples/context for the audience. Run in the Supabase SQL
-- editor. Mirrors the RLS pattern used by the other per-user tables (see tips.sql).

-- The master keynote description (the "trunk").
create table if not exists keynotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  title text not null,
  description text not null,
  -- Where the description came from: 'paste' | 'pdf' | 'docx' | 'txt'.
  source text not null default 'paste',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists keynotes_user_idx on keynotes (user_id, created_at desc);

alter table keynotes enable row level security;

-- (select auth.uid()) evaluates once per statement instead of once per row.
create policy "Users manage own keynotes" on keynotes
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Industry-tailored versions of a keynote (the "branches"). Deleting the parent
-- keynote removes its variants via the cascade.
create table if not exists keynote_variants (
  id uuid primary key default gen_random_uuid(),
  keynote_id uuid references keynotes(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  industry text not null,
  -- Optional extra audience context (e.g. "C-suite executives", "front-line nurses").
  audience text,
  tailored_description text not null,
  created_at timestamptz not null default now()
);

create index if not exists keynote_variants_keynote_idx on keynote_variants (keynote_id, created_at desc);
-- Covers the user_id foreign key and the RLS filter.
create index if not exists keynote_variants_user_idx on keynote_variants (user_id);

alter table keynote_variants enable row level security;

create policy "Users manage own keynote variants" on keynote_variants
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
