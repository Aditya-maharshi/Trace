-- Migration: 20260914200004_create_sla_policies.sql
-- Description: Per-org and per-state SLA configuration policies

create table if not exists public.sla_policies (
  id              uuid primary key default gen_random_uuid(),
  org_id          text not null default 'default',
  state           public.case_status not null,
  threshold_hours integer not null check (threshold_hours > 0),
  created_at      timestamptz not null default now(),
  constraint uq_org_state_sla unique (org_id, state)
);

-- Seed defaults for 'default' organization
insert into public.sla_policies (org_id, state, threshold_hours)
values
  ('default', 'open', 72),
  ('default', 'investigating', 48),
  ('default', 'escalated', 24)
on conflict (org_id, state) do nothing;
