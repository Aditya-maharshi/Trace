-- Migration: 20260914200005_cases_rls.sql
-- Description: Row Level Security policies for case management, audit history, wallets, and evidence

-- 1. Cases Table
alter table public.cases enable row level security;

create policy "Users can view assigned or created cases"
  on public.cases for select
  to authenticated
  using (auth.uid() = user_id or analyst_id = auth.uid() or org_id = current_setting('app.current_org_id', true));

-- 2. Case History Table (Append-only audit ledger)
alter table public.case_history enable row level security;

create policy "Users can view history for accessible cases"
  on public.case_history for select
  to authenticated
  using (
    exists (
      select 1 from public.cases c
      where c.id = case_history.case_id
        and (c.user_id = auth.uid() or c.analyst_id = auth.uid() or c.org_id = current_setting('app.current_org_id', true))
    )
  );

-- Explicitly block direct client writes to case_history (backend inserts via service role)
create policy "No direct client inserts on case_history"
  on public.case_history for insert
  to anon, authenticated
  with check (false);

create policy "No direct client updates on case_history"
  on public.case_history for update
  to anon, authenticated
  using (false)
  with check (false);

create policy "No direct client deletes on case_history"
  on public.case_history for delete
  to anon, authenticated
  using (false);

-- 3. Case Wallets Table
alter table public.case_wallets enable row level security;

create policy "Users can view wallets for accessible cases"
  on public.case_wallets for select
  to authenticated
  using (
    exists (
      select 1 from public.cases c
      where c.id = case_wallets.case_id
        and (c.user_id = auth.uid() or c.analyst_id = auth.uid() or c.org_id = current_setting('app.current_org_id', true))
    )
  );

-- 4. Case Evidence Table
alter table public.case_evidence enable row level security;

create policy "Users can view evidence for accessible cases"
  on public.case_evidence for select
  to authenticated
  using (
    exists (
      select 1 from public.cases c
      where c.id = case_evidence.case_id
        and (c.user_id = auth.uid() or c.analyst_id = auth.uid() or c.org_id = current_setting('app.current_org_id', true))
    )
  );

-- 5. SLA Policies Table
alter table public.sla_policies enable row level security;

create policy "Users can view SLA policies"
  on public.sla_policies for select
  to authenticated
  using (true);
