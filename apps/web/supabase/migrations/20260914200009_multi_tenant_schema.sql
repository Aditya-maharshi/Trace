-- Migration: Multi-tenant schema upgrades for SaaS billing and key isolation

-- Create orgs table if it does not exist (assuming a simplified version for this context)
CREATE TABLE IF NOT EXISTS orgs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  stripe_customer_id text,
  overage_policy text NOT NULL DEFAULT 'hard_stop'
    CHECK (overage_policy IN ('hard_stop', 'soft_overage')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended_grace', 'suspended_hard', 'deleted')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Expand api_keys table for environment separation and better revocation metadata
ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT 'Default Key',
  ADD COLUMN IF NOT EXISTS key_env text NOT NULL DEFAULT 'live' CHECK (key_env IN ('live', 'test')),
  ADD COLUMN IF NOT EXISTS revoked_by text,
  ADD COLUMN IF NOT EXISTS revoked_reason text;

-- Create usage_events table for durable, idempotent Stripe billing records
CREATE TABLE IF NOT EXISTS usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL,
  lookup_id uuid NOT NULL,                -- Reference to the trace/case/operation
  event_type text NOT NULL,               -- e.g., 'address_attribute', 'case_transition'
  occurred_at timestamptz NOT NULL DEFAULT now(),
  synced_to_stripe_at timestamptz,        -- NULL if not yet synced

  UNIQUE (org_id, lookup_id)              -- Enforce idempotent recording
);

CREATE INDEX idx_usage_events_org ON usage_events (org_id);
CREATE INDEX idx_usage_events_unsynced ON usage_events (org_id) WHERE synced_to_stripe_at IS NULL;

-- Enable RLS on usage_events
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usage_events_org_isolation" ON usage_events
  FOR ALL
  USING (org_id = current_setting('app.org_id', true));

-- Update any orgs policies to rely on app.org_id (assuming orgs is readable by members)
ALTER TABLE orgs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orgs_isolation" ON orgs
  FOR SELECT
  USING (id::text = current_setting('app.org_id', true));
