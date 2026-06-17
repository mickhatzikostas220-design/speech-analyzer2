-- Booking Inbox — run in the Supabase SQL editor.
-- A lightweight CRM pipeline for incoming speaking inquiries. Inquiries can
-- be added by hand or captured from a speaker's public one-sheet, then moved
-- through a pipeline and (once confirmed) pushed to the gigs calendar.

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  organization text,
  contact_name text,
  contact_email text,
  event_name text,
  event_date date,
  location text,
  fee numeric,
  status text not null default 'new'
    check (status in ('new', 'discussing', 'confirmed', 'declined', 'completed')),
  notes text,
  source text not null default 'manual' check (source in ('manual', 'one_sheet')),
  created_at timestamptz default now()
);

create index if not exists bookings_user_idx on bookings (user_id, created_at desc);

alter table bookings enable row level security;

drop policy if exists "Users view own bookings" on bookings;
create policy "Users view own bookings" on bookings for select using (auth.uid() = user_id);
drop policy if exists "Users insert own bookings" on bookings;
create policy "Users insert own bookings" on bookings for insert with check (auth.uid() = user_id);
drop policy if exists "Users update own bookings" on bookings;
create policy "Users update own bookings" on bookings for update using (auth.uid() = user_id);
drop policy if exists "Users delete own bookings" on bookings;
create policy "Users delete own bookings" on bookings for delete using (auth.uid() = user_id);

-- Public inquiries (from the one-sheet) are inserted server-side with the
-- service role, so no public insert policy is needed here.
