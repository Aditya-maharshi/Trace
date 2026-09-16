-- Migration: 20260914200002_create_case_wallets.sql
-- Description: Join table for wallet clusters associated with a case

create table if not exists public.case_wallets (
  id        uuid primary key default gen_random_uuid(),
  case_id   uuid not null references public.cases(id) on delete cascade,
  address   text not null,
  added_by  text,
  added_at  timestamptz not null default now(),
  notes     text,
  constraint uq_case_wallet unique (case_id, address)
);

create index if not exists idx_case_wallets_case_id on public.case_wallets (case_id);
create index if not exists idx_case_wallets_address on public.case_wallets (lower(address));
