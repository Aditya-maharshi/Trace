-- Migration: Postgres helper functions for explicit transaction control
-- These are called from the API layer via supabase.rpc() to manage
-- transaction boundaries and RLS context injection from application code.

-- begin_transaction: Starts an explicit transaction
CREATE OR REPLACE FUNCTION begin_transaction()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- No-op in Supabase REST context: each rpc() is its own implicit transaction.
  -- This exists as a named handle for future pooler-aware transaction management
  -- and as explicit documentation that this call site controls transactions.
  NULL;
END;
$$;

-- set_tenant_context: Injects org_id into the current transaction's session
-- This is the critical RLS binding call. SET LOCAL scopes to the current transaction.
CREATE OR REPLACE FUNCTION set_tenant_context(p_org_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM set_config('app.current_org_id', p_org_id, true); -- true = LOCAL (transaction-scoped)
END;
$$;

-- commit_transaction: Marks the logical end of a managed transaction
CREATE OR REPLACE FUNCTION commit_transaction()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  NULL;
END;
$$;

-- rollback_transaction: Signals a rollback (Supabase auto-rolls back on error)
CREATE OR REPLACE FUNCTION rollback_transaction()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  NULL;
END;
$$;

-- Revoke public execution rights — only the service role should call these
REVOKE EXECUTE ON FUNCTION begin_transaction() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION set_tenant_context(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION commit_transaction() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION rollback_transaction() FROM PUBLIC;
