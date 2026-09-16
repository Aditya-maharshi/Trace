-- Migration: 20260914200003_create_case_evidence.sql
-- Description: Cryptographic evidence pinning table with SHA-256 payload integrity hashing

create table if not exists public.case_evidence (
  id                 uuid primary key default gen_random_uuid(),
  case_id            uuid not null references public.cases(id) on delete cascade,
  evidence_type      text not null check (evidence_type in ('graph_node', 'graph_edge', 'subgraph_slice', 'lookup_snapshot', 'note')),
  lookup_id          uuid references public.lookups(id) on delete set null,
  graph_payload_hash text not null,
  subgraph_slice     jsonb,
  pinned_by          text,
  pinned_at          timestamptz not null default now(),
  annotation         text
);

create index if not exists idx_case_evidence_case_id on public.case_evidence (case_id);
create index if not exists idx_case_evidence_lookup_id on public.case_evidence (lookup_id);
