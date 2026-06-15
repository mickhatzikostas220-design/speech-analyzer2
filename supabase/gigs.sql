-- Speaking gigs / calendar — run in the Supabase SQL editor.
-- Powers the "Upcoming gigs" panel on the hub: manually-added gigs plus
-- events pulled from a connected calendar feed (iCal/ICS URL).

create table if not exists gigs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  title text not null,
  location text,
  kind text,                                  -- Keynote, Workshop, Podcast…
  status text not null default 'confirmed'
    check (status in ('confirmed', 'hold', 'tentative', 'ticketed')),
  starts_at timestamptz not null,
  source text not null default 'manual' check (source in ('manual', 'calendar')),
  created_at timestamptz default now()
);

create index if not exists gigs_user_starts_idx on gigs (user_id, starts_at);

alter table gigs enable row level security;

drop policy if exists "Users view own gigs" on gigs;
create policy "Users view own gigs" on gigs for select using (auth.uid() = user_id);
drop policy if exists "Users insert own gigs" on gigs;
create policy "Users insert own gigs" on gigs for insert with check (auth.uid() = user_id);
drop policy if exists "Users update own gigs" on gigs;
create policy "Users update own gigs" on gigs for update using (auth.uid() = user_id);
drop policy if exists "Users delete own gigs" on gigs;
create policy "Users delete own gigs" on gigs for delete using (auth.uid() = user_id);

-- A connected calendar feed (Google/Outlook/Apple all expose a secret iCal URL).
alter table profiles
  add column if not exists calendar_ics_url text;
