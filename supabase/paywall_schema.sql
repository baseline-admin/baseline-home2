-- Paywall / subscription infrastructure.
-- Run this once in the Supabase SQL Editor (Project → SQL Editor → New query).
--
-- Security model: every write to these tables goes through the service-role
-- key from api/server.js (Stripe webhook, trial-init endpoint, referral
-- logic). The anon/publishable key used by the client can only read its own
-- rows. This is deliberate — these tables gate paid access, so the app must
-- never trust a client-supplied write to them.

-- Tracks subscription status per user. One row per user.
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text not null default 'trialing'
    check (status in ('trialing', 'active', 'past_due', 'canceled')),
  tier text
    check (tier in ('baseline', 'baseline_pro')),
  is_lifetime_free boolean not null default false,
  trial_ends_at timestamptz,
  current_period_ends_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists subscriptions_stripe_customer_id_idx
  on public.subscriptions (stripe_customer_id);

alter table public.subscriptions enable row level security;

create policy "Users can view their own subscription"
  on public.subscriptions for select
  to authenticated
  using (auth.uid() = user_id);

-- No insert/update/delete policies for authenticated users on purpose.
-- All writes happen server-side via the service-role key, which bypasses RLS.


-- Referral codes, one per user, generated on account creation.
create table if not exists public.referral_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  code text not null unique,
  uses int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.referral_codes enable row level security;

create policy "Users can view their own referral code"
  on public.referral_codes for select
  to authenticated
  using (auth.uid() = user_id);


-- Tracks who used whose referral code, so a code can't be redeemed twice by
-- the same referred user and so payouts (free months) are auditable.
create table if not exists public.referral_uses (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references auth.users(id) on delete cascade,
  referred_user_id uuid not null unique references auth.users(id) on delete cascade,
  code text not null,
  free_month_granted boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.referral_uses enable row level security;

create policy "Users can view referral uses they're part of"
  on public.referral_uses for select
  to authenticated
  using (auth.uid() = referrer_user_id or auth.uid() = referred_user_id);


-- Permanent record of emails whose account was deleted, so re-signup with
-- the same email skips the free trial (one trial per person, not per
-- account). This table is never purged and is never exposed to clients.
create table if not exists public.deleted_account_emails (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  original_user_id uuid,
  deleted_at timestamptz not null default now()
);

alter table public.deleted_account_emails enable row level security;
-- No policies at all: this table is service-role-only, not readable by any
-- authenticated or anon client.


-- Soft-delete bookkeeping on profiles: account deletion deactivates
-- immediately and hard-deletes after a 14-day grace period (cron-driven,
-- built later). Adjust the table name below if your profiles table has a
-- different name.
alter table public.profiles
  add column if not exists deletion_requested_at timestamptz,
  add column if not exists scheduled_deletion_at timestamptz;
