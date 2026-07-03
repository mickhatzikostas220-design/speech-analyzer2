-- Pinned tools — run in the Supabase SQL editor.
-- Lets a speaker favorite hub tools; the favorited keys (from
-- lib/tools/catalog.ts) are pinned to the top bar. One text[] column on the
-- existing profile row, defaulting to empty. Reads/writes are owner-scoped by
-- the existing "Users view/update own profile" RLS policies on profiles.

alter table profiles
  add column if not exists favorite_tools text[] not null default '{}'::text[];
