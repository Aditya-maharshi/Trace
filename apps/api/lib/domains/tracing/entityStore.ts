/**
 * lib/domains/tracing/entityStore.ts
 *
 * Entity labeling store — queries the Supabase `entity_labels` table,
 * with graceful fallback to the static in-process registries (vaspLabels,
 * mixerLabels, bridgeLabels) when the DB is unavailable.
 *
 * ### Table schema (Supabase migration in data/migrations/entity_labels.sql):
 *   id            UUID PRIMARY KEY DEFAULT gen_random_uuid()
 *   address       TEXT NOT NULL UNIQUE  -- lowercased on-chain address
 *   chain         TEXT NOT NULL          -- "ethereum" | "bitcoin" | etc.
 *   entity_type   TEXT NOT NULL          -- EntityType value
 *   label         TEXT NOT NULL          -- human-readable name
 *   source        TEXT NOT NULL          -- e.g. "ofac-sdn" | "manual-analyst-tag"
 *   confidence_base FLOAT DEFAULT 1.0   -- base confidence (0–1), may be < 1 for inferred labels
 *   created_at    TIMESTAMPTZ DEFAULT now()
 *   updated_at    TIMESTAMPTZ DEFAULT now()
 *
 * ### Confidence framing (REQUIRED by spec):
 * Every KnownEntityResult returned by this module includes a `confidenceLabel`
 * string pre-formatted as:
 *   "N% confidence — investigative lead, requires VASP confirmation"
 * This framing must appear everywhere this score is surfaced (API, UI, reports).
 * It is NOT optional — it prevents the score from being read as a certainty.
 *
 * ### Source trust weights (used by confidence scoring):
 *   ofac-sdn           = 1.00  (highest — US Treasury sanctions list)
 *   etherscan-labels   = 0.90  (community-verified, MIT dataset)
 *   brianleect-labels  = 0.85  (MIT-licensed open-source dataset)
 *   manual-analyst-tag = 0.95  (human analyst with case context)
 *   inferred           = 0.50  (heuristically derived, lower trust)
 */

import { getSupabaseAdmin } from "../core/auditLog";
import type { KnownEntityResult, EntityType, SupportedChain } from "./chainAdapter";
import { labelFor as vaspLabelFor } from "./vaspLabels";
import { mixerLabelFor } from "./mixerLabels";
import { labelForBridge, isBridge } from "./bridgeLabels";

// ─────────────────────────────────────────────────────────────────────────────
// Source trust mapping
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Source reliability weights for confidence scoring.
 *
 * Weight rationale:
 *   - OFAC SDN is the authoritative US government sanctions list — maximum trust.
 *   - Analyst tags are human-reviewed with case context — very high trust.
 *   - Etherscan labels are community-maintained but broadly verified — high trust.
 *   - brianleect open-source labels are MIT-licensed, spot-checked — slightly lower.
 *   - Inferred labels are heuristic and unverified — half trust.
 */
export const SOURCE_TRUST_WEIGHTS: Record<string, number> = {
  "ofac-sdn": 1.00,
  "manual-analyst-tag": 0.95,
  "etherscan-labels": 0.90,
  "brianleect-labels": 0.85,
  "inferred": 0.50,
};

function sourceTrust(source: string): number {
  return SOURCE_TRUST_WEIGHTS[source] ?? 0.70;
}

// ─────────────────────────────────────────────────────────────────────────────
// Confidence label formatting (MANDATORY framing per spec)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a confidence score (0–100) into the mandatory investigative-lead label.
 *
 * ⚠ This string MUST appear wherever the score is surfaced — API responses,
 * UI badges, PDF reports. Do not show a bare number.
 */
export function formatConfidenceLabel(score: number): string {
  return `${Math.round(score)}% confidence — investigative lead, requires VASP confirmation`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Multi-factor confidence scoring
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute a confidence score (0–100) for an entity identification.
 *
 * Formula (four factors, weighted sum):
 *
 *   score = (sourceTrust × 40)
 *         + (pathConvergence × 30)
 *         + (recencyFactor × 20)
 *         + (amountConcentration × 10)
 *
 * Factor rationale:
 *   sourceTrust (40%): How reliable is the data source?
 *     OFAC = 1.0, analyst = 0.95, etherscan = 0.90 …
 *     Dominates because a bad label is worse than a missing one.
 *
 *   pathConvergence (30%): How many independent paths reach this entity?
 *     convergence = min(pathCount, 5) / 5 — capped at 5 paths (beyond
 *     that, marginal evidence is already very strong).
 *
 *   recencyFactor (20%): How recent is the last transaction to this entity?
 *     recency = 1 / (1 + daysSinceLastTx / 30) — decays over ~30 days.
 *     Stale connections weigh less because funds may have moved on.
 *
 *   amountConcentration (10%): What fraction of the wallet's total outflow
 *     went to this entity?
 *     concentration = min(fractionOfOutflow, 1.0).
 *     Large direct transfers are stronger evidence than dust.
 */
export function computeMultiFactorConfidence(factors: {
  source: string;
  pathCount: number;
  daysSinceLastTx: number;
  fractionOfOutflow: number;
}): number {
  const trustWeight = sourceTrust(factors.source);

  // pathConvergence: 0–1, saturates at 5 independent paths
  const pathConvergence = Math.min(factors.pathCount, 5) / 5;

  // recencyFactor: 1.0 when very recent, decays toward 0 over ~30 days
  const recencyFactor = 1 / (1 + factors.daysSinceLastTx / 30);

  // amountConcentration: capped at 1.0
  const amountConcentration = Math.min(Math.max(factors.fractionOfOutflow, 0), 1);

  const score =
    trustWeight * 40 +
    pathConvergence * 30 +
    recencyFactor * 20 +
    amountConcentration * 10;

  return Math.min(Math.round(score), 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// Core lookup function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Look up whether an address is a known entity.
 *
 * Resolution order:
 * 1. Supabase `entity_labels` table (authoritative, includes analyst tags)
 * 2. Static VASP label registry (vaspLabels.ts)
 * 3. Static mixer label registry (mixerLabels.ts)
 * 4. Static bridge label registry (bridgeLabels.ts)
 *
 * Returns null if the address is not found in any registry.
 * Never throws — falls back gracefully if Supabase is unavailable.
 */
export async function lookupEntity(
  address: string,
  chain: SupportedChain = "ethereum",
): Promise<KnownEntityResult | null> {
  const addrLower = address.toLowerCase();

  // ── 1. Supabase entity_labels ────────────────────────────────────────────
  const client = getSupabaseAdmin();
  if (client) {
    try {
      const { data, error } = await client
        .from("entity_labels")
        .select("label, entity_type, source, confidence_base")
        .eq("address", addrLower)
        .maybeSingle();

      if (!error && data) {
        const score = computeMultiFactorConfidence({
          source: data.source,
          pathCount: 1, // single DB hit; caller can re-score with path context
          daysSinceLastTx: 0,
          fractionOfOutflow: 1.0,
        });
        return {
          address: addrLower,
          label: data.label,
          entityType: data.entity_type as EntityType,
          confidenceScore: score,
          confidenceLabel: formatConfidenceLabel(score),
          source: data.source,
        };
      }
    } catch {
      // DB unavailable — fall through to static registries
      console.warn(`[entityStore] Supabase lookup failed for ${addrLower}, using static registries`);
    }
  }

  // ── 2. Static VASP registry ───────────────────────────────────────────────
  const vaspLabel = vaspLabelFor(addrLower);
  if (vaspLabel) {
    const score = computeMultiFactorConfidence({
      source: "brianleect-labels",
      pathCount: 1,
      daysSinceLastTx: 0,
      fractionOfOutflow: 1.0,
    });
    return {
      address: addrLower,
      label: vaspLabel,
      entityType: "exchange",
      confidenceScore: score,
      confidenceLabel: formatConfidenceLabel(score),
      source: "brianleect-labels",
    };
  }

  // ── 3. Static mixer registry ─────────────────────────────────────────────
  const mixerLabel = mixerLabelFor(addrLower);
  if (mixerLabel) {
    const score = computeMultiFactorConfidence({
      source: "ofac-sdn",
      pathCount: 1,
      daysSinceLastTx: 0,
      fractionOfOutflow: 1.0,
    });
    return {
      address: addrLower,
      label: mixerLabel,
      entityType: "mixer",
      confidenceScore: score,
      confidenceLabel: formatConfidenceLabel(score),
      source: "ofac-sdn",
    };
  }

  // ── 4. Static bridge registry ─────────────────────────────────────────────
  if (isBridge(addrLower)) {
    const bridgeLabel = labelForBridge(addrLower) ?? "Unknown Bridge";
    const score = computeMultiFactorConfidence({
      source: "etherscan-labels",
      pathCount: 1,
      daysSinceLastTx: 0,
      fractionOfOutflow: 1.0,
    });
    return {
      address: addrLower,
      label: bridgeLabel,
      entityType: "bridge",
      confidenceScore: score,
      confidenceLabel: formatConfidenceLabel(score),
      source: "etherscan-labels",
    };
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Upsert (used by seed script and analyst tagging)
// ─────────────────────────────────────────────────────────────────────────────

export interface UpsertEntityParams {
  address: string;
  chain: SupportedChain;
  entityType: EntityType;
  label: string;
  source: string;
  confidenceBase?: number;
}

/**
 * Insert or update an entity label in the Supabase `entity_labels` table.
 * Used by the seed script and the analyst-tagging endpoint.
 */
export async function upsertEntity(params: UpsertEntityParams): Promise<void> {
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase not available — cannot upsert entity label");

  const { error } = await client.from("entity_labels").upsert(
    {
      address: params.address.toLowerCase(),
      chain: params.chain,
      entity_type: params.entityType,
      label: params.label,
      source: params.source,
      confidence_base: params.confidenceBase ?? sourceTrust(params.source),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "address" },
  );

  if (error) {
    throw new Error(`Failed to upsert entity label for ${params.address}: ${error.message}`);
  }
}
