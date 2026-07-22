-- Tracks every normalized email that has ever been granted a trial, so
-- signing up again with a +alias of the same address (or after the
-- original account was deleted) doesn't grant a second free trial.
-- Broader than deleted_account_emails, which only catches re-signup
-- after a real hard delete — this catches it even while the original
-- account still exists.
-- Run this once in the Supabase SQL Editor (Project → SQL Editor → New query).

create table if not exists public.trial_grants (
  normalized_email text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  original_email text not null,
  created_at timestamptz not null default now()
);

alter table public.trial_grants enable row level security;
-- No policies at all: service-role only, same as deleted_account_emails —
-- never readable or writable by anon/authenticated clients.
