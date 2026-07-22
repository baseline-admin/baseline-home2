-- Lifetime-free / promo codes — distinct from referral_codes (which are
-- auto-generated per user and only enter at signup). These are admin-
-- created and redeemable any time from the Account menu, since existing
-- accounts may need to redeem one too, not just brand new signups.
-- Run this once in the Supabase SQL Editor (Project → SQL Editor → New query).

create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  grants text not null check (grants in ('lifetime_free')), -- extensible later
  max_uses int, -- null = unlimited
  uses int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.promo_codes enable row level security;
-- No policies at all: codes must never be enumerable or readable by
-- clients. Redemption goes through the server (service-role), which
-- bypasses RLS — same model as subscriptions/referral_codes writes.

-- One redemption per person, ever — enforced by the unique constraint,
-- not just app logic (same pattern as referral_uses.referred_user_id).
create table if not exists public.promo_code_redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  code text not null,
  created_at timestamptz not null default now()
);

alter table public.promo_code_redemptions enable row level security;

create policy "Users can view their own promo redemption"
  on public.promo_code_redemptions for select
  to authenticated
  using (auth.uid() = user_id);
