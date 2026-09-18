-- Migration: Fix RLS variable mismatch
-- Align all RLS policies to use app.current_org_id instead of app.org_id

DROP POLICY IF EXISTS "audit_logs_org_isolation" ON audit_logs;
CREATE POLICY "audit_logs_org_isolation" ON audit_logs
  FOR ALL
  USING (org_id = current_setting('app.current_org_id', true));

DROP POLICY IF EXISTS "mcp_client_connections_org_isolation" ON mcp_client_connections;
CREATE POLICY "mcp_client_connections_org_isolation" ON mcp_client_connections
  FOR ALL
  USING (org_id = current_setting('app.current_org_id', true));

DROP POLICY IF EXISTS "api_keys_org_isolation" ON api_keys;
CREATE POLICY "api_keys_org_isolation" ON api_keys
  FOR ALL
  USING (org_id = current_setting('app.current_org_id', true));

DROP POLICY IF EXISTS "usage_events_org_isolation" ON usage_events;
CREATE POLICY "usage_events_org_isolation" ON usage_events
  FOR ALL
  USING (org_id = current_setting('app.current_org_id', true));

DROP POLICY IF EXISTS "orgs_isolation" ON orgs;
CREATE POLICY "orgs_isolation" ON orgs
  FOR SELECT
  USING (id::text = current_setting('app.current_org_id', true));
