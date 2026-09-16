-- Migration: Create mcp_client_connections table
-- Manages outbound MCP client connections to third-party servers (Slack, Notion, etc.)
-- Credentials are referenced by pointer, never stored inline.

CREATE TABLE IF NOT EXISTS mcp_client_connections (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                text NOT NULL,
  server_name           text NOT NULL,            -- human-readable name, e.g. "Slack MCP"
  server_url            text NOT NULL,            -- MCP server endpoint URL
  auth_credential_ref   text,                     -- pointer to secrets manager entry (never raw creds)
  connected_by          text NOT NULL,            -- analyst user_id who configured
  connected_at          timestamptz NOT NULL DEFAULT now(),
  status                text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'inactive', 'error')),

  UNIQUE (org_id, server_name)
);

CREATE INDEX idx_mcp_client_connections_org ON mcp_client_connections (org_id);

ALTER TABLE mcp_client_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mcp_client_connections_org_isolation" ON mcp_client_connections
  FOR ALL
  USING (org_id = current_setting('app.org_id', true));
