-- Public speaker one-sheet — run in the Supabase SQL editor.
-- Adds a public URL slug to each profile. The one-sheet content (headline,
-- bio, signature topics, testimonials, contact) lives in profiles.brand
-- (jsonb) under `oneSheet`, so it inherits the speaker's brand theme.

alter table profiles
  add column if not exists slug text;

-- Unique slug, but allow many NULLs (speakers who haven't published yet).
create unique index if not exists profiles_slug_key on profiles (slug) where slug is not null;
