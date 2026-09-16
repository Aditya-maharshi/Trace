-- Create the lookups audit trail table.
-- Stores every authenticated attribution lookup for compliance audit purposes.

create table if not exists public.lookups (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete set null,
  queried_address text not null,
  requested_at    timestamptz not null default now(),
  nearest_vasp    text,
  confidence      text,
  risk            text,
  raw_response    jsonb,
  ip_address      text
);

-- RLS: users can only read their own lookups.
-- Client INSERT/UPDATE/DELETE are denied in 20260914120000_lookups_rls_write_deny.sql.
-- Backend writes via service-role key (bypasses RLS).
alter table public.lookups enable row level security;

create policy "Users can view own lookups"
  on public.lookups for select
  using (auth.uid() = user_id);

-- Index for the history page query (user_id + requested_at DESC).
create index if not exists idx_lookups_user_id_requested_at
  on public.lookups (user_id, requested_at desc);
