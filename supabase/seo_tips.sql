-- Generalize user_tips so it can hold both coaching tips (tip_id from the static
-- library) and custom SEO tips (saved with their own title/body), and track the
-- free tier's weekly SEO check. Run in the Supabase SQL editor.

alter table user_tips
  add column if not exists source text not null default 'coaching',
  add column if not exists title text,
  add column if not exists body text;

-- SEO tips have no library id, so tip_id must be optional now.
alter table user_tips alter column tip_id drop not null;

-- Free tier: one SEO check per week.
alter table profiles
  add column if not exists seo_last_used_at timestamptz;
