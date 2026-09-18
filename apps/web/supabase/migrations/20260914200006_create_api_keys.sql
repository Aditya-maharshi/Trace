-- Migration: Create api_keys table for tenant-isolated MCP authentication
-- Keys are stored hashed (SHA-256), never plaintext. A raw key is shown once at creation.

CREATE TABLE IF NOT EXISTS api_keys (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        text NOT NULL,
  key_prefix    text NOT NULL,            -- e.g. "trace_live_sk_abc1" (first ~12 chars for log recognition)
  key_hash      text NOT NULL UNIQUE,     -- SHA-256 hex digest of the full key
  scopes        text[] NOT NULL DEFAULT '{}',
  created_by    text NOT NULL,            -- analyst user_id or 'system'
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz,
  expires_at    timestamptz,
  revoked_at    timestamptz
);

-- Index for fast hash lookups on every request
CREATE INDEX idx_api_keys_key_hash ON api_keys (key_hash);

-- Index for listing keys by org
CREATE INDEX idx_api_keys_org_id ON api_keys (org_id);

-- RLS: keys are scoped to org
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "api_keys_org_isolation" ON api_keys
  FOR ALL
  USING (org_id = current_setting('app.current_org_id', true));
