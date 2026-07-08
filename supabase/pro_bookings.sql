-- Baseline Pro consultation bookings.
-- Run this once in the Supabase SQL Editor (Project → SQL Editor → New query)
-- before the Pro tab calendar will work — the app queries these objects
-- via the anon/publishable key, and they don't exist until this runs.

create table if not exists public.pro_bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  slot_datetime timestamptz not null,
  email text not null,
  notes text,
  created_at timestamptz not null default now(),
  unique (slot_datetime)
);

alter table public.pro_bookings enable row level security;

create policy "Users can insert their own bookings"
  on public.pro_bookings for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can view their own bookings"
  on public.pro_bookings for select
  to authenticated
  using (auth.uid() = user_id);

-- Exposes only slot_datetime (no user_id/email/notes) so any signed-in user
-- can see which slots are taken, without seeing whose booking it is or their
-- notes. Owned by the role that runs this script, so it bypasses the base
-- table's RLS by design — that's what lets it show everyone's booked slots.
create or replace view public.pro_booked_slots as
  select slot_datetime from public.pro_bookings;

grant select on public.pro_booked_slots to authenticated;
