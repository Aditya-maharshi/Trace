-- Supabase migration: entity_labels table
-- Run via: supabase db push OR manually in the Supabase SQL editor
-- 
-- This table is the authoritative store for labeled on-chain entities.
-- It backs the entityStore.ts lookupEntity() function.
--
-- Sources seeded:
--   1. OFAC SDN cryptocurrency addresses (source: "ofac-sdn")
--   2. Etherscan-labels / brianleect MIT dataset (source: "brianleect-labels")
--   3. OFAC-designated Tornado Cash contracts (source: "ofac-sdn")
--   4. Analyst-tagged entities (source: "manual-analyst-tag")
--
-- The seed script apps/api/scripts/seedEntityLabels.ts populates this table.

CREATE TABLE IF NOT EXISTS entity_labels (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address           TEXT NOT NULL,
  chain             TEXT NOT NULL DEFAULT 'ethereum',
  entity_type       TEXT NOT NULL,   -- EntityType: exchange | hot-wallet | deposit-wallet | mixer | bridge | darknet-market | sanctioned | unknown
  label             TEXT NOT NULL,
  source            TEXT NOT NULL,   -- Data source identifier; drives confidence scoring
  confidence_base   FLOAT NOT NULL DEFAULT 1.0,  -- 0.0–1.0 base trust for this source
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT entity_labels_address_chain_unique UNIQUE (address, chain)
);

-- Index for fast address+chain lookups (primary access pattern)
CREATE INDEX IF NOT EXISTS idx_entity_labels_address_chain
  ON entity_labels (address, chain);

-- Index for filtering by entity type (dashboard queries)
CREATE INDEX IF NOT EXISTS idx_entity_labels_entity_type
  ON entity_labels (entity_type);

-- Index for filtering by source (admin/seed operations)
CREATE INDEX IF NOT EXISTS idx_entity_labels_source
  ON entity_labels (source);

-- Trigger to auto-update updated_at on any row change
CREATE OR REPLACE FUNCTION update_entity_labels_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_entity_labels_updated_at ON entity_labels;
CREATE TRIGGER trg_entity_labels_updated_at
  BEFORE UPDATE ON entity_labels
  FOR EACH ROW
  EXECUTE FUNCTION update_entity_labels_updated_at();

-- Row Level Security: service_role can read/write; anon can only read
ALTER TABLE entity_labels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS entity_labels_service_rw ON entity_labels;
CREATE POLICY entity_labels_service_rw ON entity_labels
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS entity_labels_anon_read ON entity_labels;
CREATE POLICY entity_labels_anon_read ON entity_labels
  FOR SELECT
  TO anon
  USING (true);

-- sahyog_trace_jobs: tracks asynchronous SAHYOG intake trace requests
CREATE TABLE IF NOT EXISTS sahyog_trace_jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_reference   TEXT NOT NULL,         -- case_id or NCRP complaint number
  wallets          TEXT[] NOT NULL,       -- target wallets to trace
  chain            TEXT NOT NULL DEFAULT 'ethereum',
  status           TEXT NOT NULL DEFAULT 'pending',  -- pending | tracing | attributed | failed
  submitted_by     TEXT,                  -- officer user_id
  attribution_result JSONB,              -- encrypted AttributionResponse when complete
  sahyog_payload   JSONB,                -- compiled SahyogPayload (PREPARED_NOT_TRANSMITTED)
  sahyog_status    TEXT DEFAULT 'not_compiled',  -- not_compiled | prepared | transmitted
  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sahyog_jobs_case ON sahyog_trace_jobs (case_reference);
CREATE INDEX IF NOT EXISTS idx_sahyog_jobs_status ON sahyog_trace_jobs (status);

ALTER TABLE sahyog_trace_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sahyog_jobs_service_rw ON sahyog_trace_jobs;
CREATE POLICY sahyog_jobs_service_rw ON sahyog_trace_jobs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- generated_documents: stores Section 63 certs, Section 94 summons, SAHYOG payloads
CREATE TABLE IF NOT EXISTS generated_documents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id         UUID REFERENCES sahyog_trace_jobs(id) ON DELETE CASCADE,
  case_reference TEXT NOT NULL,
  doc_type       TEXT NOT NULL,  -- section_63_cert | section_94_summons | sahyog_freeze | ivms101_travel_rule
  content_hash   TEXT NOT NULL,  -- SHA-256 of the document content (integrity)
  generated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by   TEXT,           -- officer user_id
  -- The actual document is NOT stored here — it is generated on demand from
  -- the attribution result in sahyog_trace_jobs to prevent tampering.
  -- This row is the audit trail that a document was generated.
  metadata       JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_generated_docs_case ON generated_documents (case_reference);
CREATE INDEX IF NOT EXISTS idx_generated_docs_job ON generated_documents (job_id);

ALTER TABLE generated_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS generated_docs_service_rw ON generated_documents;
CREATE POLICY generated_docs_service_rw ON generated_documents
  FOR ALL TO service_role USING (true) WITH CHECK (true);
