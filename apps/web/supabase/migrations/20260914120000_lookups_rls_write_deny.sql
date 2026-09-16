-- Explicitly deny client-side writes to lookups.
-- Backend continues to insert via the service-role key, which bypasses RLS.
-- Without these policies, a future client-side insert path would either
-- silently fail (no INSERT policy) or succeed under the wrong role.

create policy "No client inserts on lookups"
  on public.lookups
  for insert
  to anon, authenticated
  with check (false);

create policy "No client updates on lookups"
  on public.lookups
  for update
  to anon, authenticated
  using (false)
  with check (false);

create policy "No client deletes on lookups"
  on public.lookups
  for delete
  to anon, authenticated
  using (false);

comment on column public.lookups.ip_address is
  'Salted HMAC-SHA256 prefix of the client IP (h:<hex>), never plaintext.';
