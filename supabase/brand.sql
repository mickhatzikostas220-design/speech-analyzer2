-- Per-speaker branding — run in the Supabase SQL editor.
-- Adds the brand kit + onboarding state to each profile, and a public
-- bucket for any logo / hero images a speaker uploads from Settings.

-- 1) Brand columns on profiles -------------------------------------------------
alter table profiles
  add column if not exists display_name text,
  add column if not exists website_url  text,
  add column if not exists brand        jsonb,
  add column if not exists onboarded_at timestamptz;

-- 2) Storage for uploaded brand assets (logos, headshots) ----------------------
insert into storage.buckets (id, name, public)
values ('brand-assets', 'brand-assets', true)
on conflict (id) do nothing;

-- Public read (assets are referenced by <img src>), owner-scoped writes.
drop policy if exists "Public read brand assets" on storage.objects;
create policy "Public read brand assets" on storage.objects
  for select using (bucket_id = 'brand-assets');

drop policy if exists "Users upload own brand assets" on storage.objects;
create policy "Users upload own brand assets" on storage.objects
  for insert with check (
    bucket_id = 'brand-assets' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users update own brand assets" on storage.objects;
create policy "Users update own brand assets" on storage.objects
  for update using (
    bucket_id = 'brand-assets' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users delete own brand assets" on storage.objects;
create policy "Users delete own brand assets" on storage.objects
  for delete using (
    bucket_id = 'brand-assets' and auth.uid()::text = (storage.foldername(name))[1]
  );
