-- Migration: 20260914200000_create_cases.sql
-- Description: Core case management table with versioning, optimistic concurrency, and SLA tracking

do $$
begin
  if not exists (select 1 from pg_type where typname = 'case_status') then
    create type public.case_status as enum ('open', 'investigating', 'escalated', 'closed');
  end if;
  if not exists (select 1 from pg_type where typname = 'sla_status') then
    create type public.sla_status as enum ('ok', 'warning', 'breached');
  end if;
end
$$;

create table if not exists public.cases (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid references auth.users(id) on delete set null,
  org_id                  text not null default 'default',
  title                   text not null,
  description             text,
  status                  public.case_status not null default 'open',
  version                 integer not null default 1,
  analyst_id              uuid references auth.users(id) on delete set null,
  wallets                 text[] not null default '{}',
  jurisdiction            text,
  risk_score              numeric,
  entered_current_state_at timestamptz not null default now(),
  sla_status              public.sla_status not null default 'ok',
  reason_for_transition   text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists idx_cases_status on public.cases (status);
create index if not exists idx_cases_user_id on public.cases (user_id);
create index if not exists idx_cases_org_id on public.cases (org_id);
create index if not exists idx_cases_sla_sweep on public.cases (status, entered_current_state_at);
