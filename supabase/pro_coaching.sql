-- Baseline Pro coaching: video uploads + coach chat.
-- Run this once in the Supabase SQL Editor (Project → SQL Editor → New query).
--
-- There is exactly one coach account for now, identified by a stable flag
-- on their own profiles row (auth.users.id), NOT by email or display_id —
-- display_id is user-regenerable (see confirmRefreshDisplayId in
-- account.js) and email duplicates identity across this file and env vars
-- if used in RLS. After running this file, set the coach's flag by hand:
--   update public.profiles set is_coach = true where id =
--     (select id from auth.users where email = 'samuel@baseline.fitness');

alter table public.profiles add column if not exists is_coach boolean not null default false;


-- Training videos a Pro subscriber uploads for their coach to review.
-- Rows are only ever inserted by the server (service-role key, after it
-- HEAD-verifies the object actually landed in R2) — mirrors the
-- `subscriptions` table's "writes are server-only" precedent in
-- paywall_schema.sql. There is deliberately no insert policy below.
create table if not exists public.pro_videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  r2_key text not null,
  original_filename text,
  created_at timestamptz not null default now()
);

create index if not exists pro_videos_user_id_idx on public.pro_videos (user_id);

alter table public.pro_videos enable row level security;

create policy "Users can view their own videos, coach can view all"
  on public.pro_videos for select
  to authenticated
  using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_coach)
  );


-- 1:1 text messages between a Pro subscriber and the coach. user_id is
-- always the subscriber the thread belongs to, regardless of who sent a
-- given message (sender distinguishes that).
create table if not exists public.pro_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sender text not null check (sender in ('user', 'coach')),
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists pro_messages_user_id_created_at_idx
  on public.pro_messages (user_id, created_at);

alter table public.pro_messages enable row level security;

create policy "Users can view their own thread, coach can view all"
  on public.pro_messages for select
  to authenticated
  using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_coach)
  );

-- Messaging the coach requires an active baseline_pro subscription
-- specifically — a lifetime_free promo grant (software-only comp) does not
-- unlock human coaching, since that has real marginal cost. The coach can
-- always reply, to any user_id.
create policy "Pro users can message their coach, coach can reply"
  on public.pro_messages for insert
  to authenticated
  with check (
    (
      auth.uid() = user_id and sender = 'user'
      and exists (
        select 1 from public.subscriptions s
        where s.user_id = auth.uid() and s.tier = 'baseline_pro'
      )
    )
    or (
      sender = 'coach'
      and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_coach)
    )
  );
