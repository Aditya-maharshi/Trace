/**
 * scripts/calibrate.ts
 *
 * Offline calibration script for VASP attribution confidence thresholds.
 * Evaluates real Ethereum wallet samples against the live BFS graph traversal
 * and attribution scoring pipeline.
 *
 * Usage:
 *   npm run calibrate
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { findNearestVASP, ALLOWED_TOKEN_CONTRACTS } from "../lib/domains/tracing/graphBuilder";
import {
  getTransactions,
  getTokenTransactions,
  setProviders,
  BlockscoutProvider,
} from "../lib/domains/tracing/etherscan";
import { buildVaspSet } from "../lib/domains/tracing/vaspLabels";
import { aggregateAttributions } from "../lib/domains/tracing/attribution";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface FixtureEntry {
  address: string;
  label?: string;
}

interface DistributionStats {
  count: number;
  min: number;
  p10: number;
  p25: number;
  median: number;
  p75: number;
  p90: number;
  max: number;
  mean: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (p <= 0) return sorted[0];
  if (p >= 1) return sorted[sorted.length - 1];

  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  if (lower === upper) return sorted[lower];
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function computeStats(scores: number[]): DistributionStats {
  if (scores.length === 0) {
    return { count: 0, min: 0, p10: 0, p25: 0, median: 0, p75: 0, p90: 0, max: 0, mean: 0 };
  }

  const sorted = [...scores].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, s) => acc + s, 0);

  return {
    count: sorted.length,
    min: Math.round(sorted[0] * 1000) / 1000,
    p10: Math.round(percentile(sorted, 0.1) * 1000) / 1000,
    p25: Math.round(percentile(sorted, 0.25) * 1000) / 1000,
    median: Math.round(percentile(sorted, 0.5) * 1000) / 1000,
    p75: Math.round(percentile(sorted, 0.75) * 1000) / 1000,
    p90: Math.round(percentile(sorted, 0.9) * 1000) / 1000,
    max: Math.round(sorted[sorted.length - 1] * 1000) / 1000,
    mean: Math.round((sum / sorted.length) * 1000) / 1000,
  };
}

async function fetchAllTxs(addr: string) {
  const [ethTxs, tokenTxs] = await Promise.all([
    getTransactions(addr),
    getTokenTransactions(addr).catch(() => ({ data: [] } as any)),
  ]);
  const allowed = tokenTxs.data.filter((t: any) =>
    ALLOWED_TOKEN_CONTRACTS.has(t.contractAddress.toLowerCase()),
  );
  return [...ethTxs.data, ...allowed];
}

async function scoreWallet(address: string, vaspSet: Set<string>): Promise<number> {
  try {
    const paths = await findNearestVASP(address, vaspSet, 2, 10);
    if (paths.length === 0) {
      return 0;
    }

    const aggregated = await aggregateAttributions(paths, fetchAllTxs);
    if (aggregated.length === 0) {
      return 0;
    }

    // Top VASP combinedScore
    return aggregated[0].combinedScore;
  } catch (err) {
    console.warn(`[calibrate] Error scoring wallet ${address}:`, err);
    return 0;
  }
}

export async function runCalibration(): Promise<{
  knownStats: DistributionStats;
  randomStats: DistributionStats;
  recommendedHigh: number;
  recommendedLow: number;
}> {
  console.log("=================================================================");
  console.log("          VASP Attribution Threshold Calibration                ");
  console.log("=================================================================\n");

  if (!process.env.ETHERSCAN_API_KEY) {
    console.log("[calibrate] No ETHERSCAN_API_KEY found; routing primary requests to Blockscout.\n");
    setProviders(new BlockscoutProvider(), new BlockscoutProvider());
  }

  const vaspSet = buildVaspSet();
  console.log(`Loaded ${vaspSet.size} known VASP target addresses for BFS.\n`);

  const knownFixturePath = path.resolve(__dirname, "fixtures/known-vasp-linked.json");
  const randomFixturePath = path.resolve(__dirname, "fixtures/random-wallets.json");

  if (!fs.existsSync(knownFixturePath) || !fs.existsSync(randomFixturePath)) {
    throw new Error("Fixture files not found in scripts/fixtures/.");
  }

  const knownFixtures = JSON.parse(fs.readFileSync(knownFixturePath, "utf-8")) as FixtureEntry[];
  const randomFixtures = JSON.parse(fs.readFileSync(randomFixturePath, "utf-8")) as FixtureEntry[];

  console.log(`1. Scoring ${knownFixtures.length} Known-VASP-Linked Wallets...`);
  const knownScores: number[] = [];
  for (let i = 0; i < knownFixtures.length; i++) {
    const item = knownFixtures[i];
    const score = await scoreWallet(item.address, vaspSet);
    knownScores.push(score);
    console.log(
      `   [${String(i + 1).padStart(2, " ")}/${knownFixtures.length}] ${item.address} (${item.label ?? "Wallet"}) -> Score: ${score.toFixed(3)}`,
    );
    await new Promise((r) => setTimeout(r, 100));
  }
  console.log(`\n   ✓ Completed ${knownFixtures.length} known wallet evaluations.\n`);

  console.log(`2. Scoring ${randomFixtures.length} Random Wallets...`);
  const randomScores: number[] = [];
  for (let i = 0; i < randomFixtures.length; i++) {
    const item = randomFixtures[i];
    const score = await scoreWallet(item.address, vaspSet);
    randomScores.push(score);
    console.log(
      `   [${String(i + 1).padStart(2, " ")}/${randomFixtures.length}] ${item.address} (${item.label ?? "Wallet"}) -> Score: ${score.toFixed(3)}`,
    );
    await new Promise((r) => setTimeout(r, 100));
  }
  console.log(`\n   ✓ Completed ${randomFixtures.length} random wallet evaluations.\n`);

  const knownStats = computeStats(knownScores);
  const randomStats = computeStats(randomScores);

  console.log("─── Score Distributions ─────────────────────────────────────────");
  console.log("Known-VASP-Linked Wallets:");
  console.log(`  Count  : ${knownStats.count}`);
  console.log(`  Min    : ${knownStats.min}`);
  console.log(`  P10    : ${knownStats.p10}`);
  console.log(`  P25    : ${knownStats.p25}`);
  console.log(`  Median : ${knownStats.median}`);
  console.log(`  P75    : ${knownStats.p75}`);
  console.log(`  P90    : ${knownStats.p90}`);
  console.log(`  Max    : ${knownStats.max}`);
  console.log(`  Mean   : ${knownStats.mean}`);

  console.log("\nRandom Sample Wallets:");
  console.log(`  Count  : ${randomStats.count}`);
  console.log(`  Min    : ${randomStats.min}`);
  console.log(`  P10    : ${randomStats.p10}`);
  console.log(`  P25    : ${randomStats.p25}`);
  console.log(`  Median : ${randomStats.median}`);
  console.log(`  P75    : ${randomStats.p75}`);
  console.log(`  P90    : ${randomStats.p90}`);
  console.log(`  Max    : ${randomStats.max}`);
  console.log(`  Mean   : ${randomStats.mean}`);

  // Suggested thresholds based on CALIBRATION NOTE methodology:
  // - High threshold: 90th percentile of the known-VASP-linked scores
  // - Low threshold: 10th percentile of the random-wallet scores
  const suggestedHigh = knownStats.p90;
  const suggestedLow = randomStats.p10;

  const dateStr = new Date().toISOString().slice(0, 7); // e.g. 2026-09

  console.log("\n─── Recommendation ──────────────────────────────────────────────");
  console.log(`Suggested High Threshold (90th percentile of known-VASP-linked) : ${suggestedHigh.toFixed(2)}`);
  console.log(`Suggested Low Threshold  (10th percentile of random wallets)     : ${suggestedLow.toFixed(2)}`);
  console.log("\nDocumentation snippet for lib/attribution.ts:");
  console.log("-----------------------------------------------------------------");
  console.log(`// Calibrated ${dateStr} against ${knownFixtures.length} known + ${randomFixtures.length} random wallets, see scripts/calibrate.ts`);
  console.log(`// Known wallets: Min=${knownStats.min}, Median=${knownStats.median}, P90=${knownStats.p90}, Max=${knownStats.max}`);
  console.log(`// Random wallets: Min=${randomStats.min}, Median=${randomStats.median}, P90=${randomStats.p90}, Max=${randomStats.max}`);
  console.log(`// Suggested thresholds: High > ${suggestedHigh.toFixed(1)}, Medium > ${suggestedLow.toFixed(1)}, Low <= ${suggestedLow.toFixed(1)}`);
  console.log("-----------------------------------------------------------------\n");

  return {
    knownStats,
    randomStats,
    recommendedHigh: suggestedHigh,
    recommendedLow: suggestedLow,
  };
}

if (process.argv[1] && process.argv[1].endsWith("calibrate.ts")) {
  runCalibration().catch((err) => {
    console.error("[calibrate] Fatal error:", err);
    process.exit(1);
  });
}
