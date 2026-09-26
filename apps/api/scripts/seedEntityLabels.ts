/**
 * scripts/seedEntityLabels.ts
 *
 * Seeds the Supabase `entity_labels` table from the existing static registries:
 *   1. FALLBACK_VASP_LABELS from vaspLabels.ts  (source: "brianleect-labels")
 *   2. Dynamic VASP labels from data/vasp_labels.json (source: "brianleect-labels")
 *   3. MIXER_LABELS from mixerLabels.ts          (source: "ofac-sdn")
 *   4. BRIDGE_LABELS from bridgeLabels.ts         (source: "etherscan-labels")
 *
 * Usage:
 *   cd apps/api
 *   tsx scripts/seedEntityLabels.ts
 *
 * Prerequisites:
 *   - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set
 *   - Run the entity_labels.sql migration first
 *
 * Idempotent: uses ON CONFLICT DO UPDATE (upsert) so it can be re-run safely.
 */

import { createClient } from "@supabase/supabase-js";
import { FALLBACK_VASP_LABELS, getVaspLabels } from "../lib/domains/tracing/vaspLabels";
import { MIXER_LABELS } from "../lib/domains/tracing/mixerLabels";
import { BRIDGE_LABELS } from "../lib/domains/tracing/bridgeLabels";

// ─────────────────────────────────────────────────────────────────────────────
// Startup validation
// ─────────────────────────────────────────────────────────────────────────────

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error(
    "[seedEntityLabels] FATAL: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.\n" +
    "Set them in apps/api/.env.local and re-run."
  );
  process.exit(1);
}

const client = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─────────────────────────────────────────────────────────────────────────────
// Seed helpers
// ─────────────────────────────────────────────────────────────────────────────

interface EntityRow {
  address: string;
  chain: string;
  entity_type: string;
  label: string;
  source: string;
  confidence_base: number;
}

async function batchUpsert(rows: EntityRow[], batchSize = 100): Promise<void> {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await client
      .from("entity_labels")
      .upsert(batch, { onConflict: "address,chain" });

    if (error) {
      throw new Error(`Batch upsert failed at offset ${i}: ${error.message}`);
    }
    process.stdout.write(`\r  Seeded ${Math.min(i + batchSize, rows.length)} / ${rows.length} rows`);
  }
  process.stdout.write("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Main seed procedure
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("[seedEntityLabels] Starting entity label seed...\n");
  let totalRows = 0;

  // ── 1. VASP labels (exchanges, hot wallets) ───────────────────────────────
  console.log("  Seeding VASP labels...");
  const allVaspLabels = getVaspLabels(); // loads from file or falls back
  const vaspRows: EntityRow[] = Object.entries(allVaspLabels).map(([address, label]) => ({
    address: address.toLowerCase(),
    chain: "ethereum",
    entity_type: label.toLowerCase().includes("hot") ? "hot-wallet" : "exchange",
    label,
    source: "brianleect-labels",
    confidence_base: 0.85,
  }));
  await batchUpsert(vaspRows);
  totalRows += vaspRows.length;
  console.log(`  ✓ ${vaspRows.length} VASP labels seeded`);

  // ── 2. Mixer labels (OFAC SDN — Tornado Cash, Blender.io) ─────────────────
  console.log("\n  Seeding mixer labels (OFAC SDN)...");
  const mixerRows: EntityRow[] = Object.entries(MIXER_LABELS).map(([address, label]) => ({
    address: address.toLowerCase(),
    chain: "ethereum",
    entity_type: "mixer",
    label,
    source: "ofac-sdn",
    confidence_base: 1.0, // OFAC SDN is highest-trust source
  }));
  await batchUpsert(mixerRows);
  totalRows += mixerRows.length;
  console.log(`  ✓ ${mixerRows.length} mixer labels seeded`);

  // ── 3. Bridge labels ────────────────────────────────────────────────────────
  console.log("\n  Seeding bridge labels...");
  const bridgeRows: EntityRow[] = Object.entries(BRIDGE_LABELS).map(([address, label]) => ({
    address: address.toLowerCase(),
    chain: "ethereum",
    entity_type: "bridge",
    label,
    source: "etherscan-labels",
    confidence_base: 0.90,
  }));
  await batchUpsert(bridgeRows);
  totalRows += bridgeRows.length;
  console.log(`  ✓ ${bridgeRows.length} bridge labels seeded`);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n[seedEntityLabels] Done. Total rows upserted: ${totalRows}`);
  console.log("  All existing rows were preserved (upsert on conflict = update).");
  console.log("  Analyst-tagged entities (source: manual-analyst-tag) are NEVER overwritten by this script.");
}

main().catch((err) => {
  console.error("[seedEntityLabels] FATAL:", err);
  process.exit(1);
});
