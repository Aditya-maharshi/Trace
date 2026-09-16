-- Migration: 20260914200001_create_case_history.sql
-- Description: Immutable, append-only audit ledger for all case state transitions and actions

create table if not exists public.case_history (
  id          uuid primary key default gen_random_uuid(),
  case_id     uuid not null references public.cases(id) on delete cascade,
  from_state  public.case_status,
  to_state    public.case_status not null,
  actor_id    text,
  actor_type  text not null check (actor_type in ('human', 'system', 'api')),
  reason      text not null check (length(trim(reason)) > 0),
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists idx_case_history_case_id on public.case_history (case_id, created_at desc);

-- Enforce append-only semantics by revoking UPDATE and DELETE at the PostgreSQL permission layer
revoke update, delete on public.case_history from public, authenticated, anon;
