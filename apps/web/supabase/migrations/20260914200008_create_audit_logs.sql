-- Migration: Create audit_logs table
-- Comprehensive audit trail for all agent and human actions.
-- Superset fields for MCP agent callers (scopes_used, caller_type).

CREATE TABLE IF NOT EXISTS audit_logs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_type       text NOT NULL DEFAULT 'human'
                    CHECK (caller_type IN ('human', 'mcp_agent', 'service_account', 'automation')),
  tool_name         text,                         -- e.g. 'attribute_address', 'transition_case'
  org_id            text NOT NULL,
  identity          text NOT NULL,                -- analyst user_id or service-account name
  execution_time_ms integer,
  error_class       text                          -- 'validation' | 'authorization' | 'rate_limit' | 'internal' | null
                    CHECK (error_class IS NULL OR error_class IN ('validation', 'authorization', 'rate_limit', 'internal')),
  error_code        text,                         -- machine-parseable code, e.g. 'INVALID_ADDRESS_FORMAT'
  error_message     text,                         -- sanitized human-readable message
  related_case_id   uuid,
  scopes_used       text[],
  ip_address        text,                         -- hashed, never plaintext
  request_payload   jsonb,                        -- sanitized subset of the request (no secrets)
  response_summary  jsonb,                        -- key fields from response (not full payload)
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_org ON audit_logs (org_id);
CREATE INDEX idx_audit_logs_caller_type ON audit_logs (caller_type);
CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at DESC);
CREATE INDEX idx_audit_logs_identity ON audit_logs (identity);
CREATE INDEX idx_audit_logs_tool_name ON audit_logs (tool_name);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_org_isolation" ON audit_logs
  FOR ALL
  USING (org_id = current_setting('app.current_org_id', true));
