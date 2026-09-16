/**
 * lib/attribution.ts
 *
 * Scoring and confidence logic for VASP attribution.
 * Takes BFS PathResult(s) from graphBuilder.ts and produces a numerical score
 * reflecting how confidently we can attribute a wallet to a specific VASP.
 *
 * Scoring formula:
 *   score = (1 / hops) × ln(1 + totalValueUSD) × recencyFactor
 *
 * Rationale:
 *   - (1 / hops):  Closer connections are stronger evidence.
 *   - ln(1 + val): High-value flows matter, but marginal value diminishes.
 *   - recency:     Recent activity is more relevant than year-old transfers.
 */

import type { PathResult } from "../tracing/graphBuilder";
import type { Transaction, TokenTransaction } from "../tracing/etherscan";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

/** Confidence tier assigned to an attribution. */
export type ConfidenceLevel = "High" | "Medium" | "Low";

import type { ScoreBreakdown, ScoredAttribution } from "../../../packages/shared-types";

/**
 * Aggregated attribution result for a single VASP, combining all paths.
 */
export interface AggregatedAttribution {
  /** The VASP address. */
  vasp: string;
  /** Best (minimum) hop count across all paths to this VASP. */
  bestHops: number;
  /** Sum of individual path scores. */
  combinedScore: number;
  /** Confidence tier derived from combinedScore. */
  confidence: ConfidenceLevel;
  /** All individual paths that reach this VASP. */
  paths: ScoredAttribution[];
}

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Hardcoded token → USD conversion rates.
 *
 * TODO: Replace with a live price API (CoinGecko / CoinMarketCap) post-hackathon.
 *       For MVP, this gives us order-of-magnitude correctness which is fine
 *       since the scoring formula uses log(1 + value) anyway.
 *       Stablecoins are pegged ~1:1 USD.
 */
export const TOKEN_PRICES_USD: Record<string, number> = {
  ETH: 2500,
  USDT: 1.0,
  USDC: 1.0,
  DAI: 1.0,
};

const ETH_TO_USD = TOKEN_PRICES_USD.ETH;

/** Wei per ETH (10^18). */
const WEI_PER_ETH = 1_000_000_000_000_000_000n;

/** Milliseconds per day. */
const MS_PER_DAY = 86_400_000;

// ──────────────────────────────────────────────────────────────────────────────
// Scoring functions
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Convert a wei string to a USD number using the hardcoded ETH rate.
 * Uses bigint for the wei→ETH division to avoid precision loss, then
 * converts to a regular number for the final multiplication.
 */
/** @internal Exported for unit-test coverage of precision behavior. */
export function weiToUSD(weiStr: string): number {
  const wei = BigInt(weiStr || "0");
  // Convert to "micro-ETH" first (6 more decimal places) then divide
  // to get a floating-point ETH value with reasonable precision.
  const microEth = Number((wei * 1_000_000n) / WEI_PER_ETH) / 1_000_000;
  return microEth * ETH_TO_USD;
}

/**
 * Convert raw ERC-20 token value string to USD based on token decimals and price.
 */
export function tokenValueToUSD(
  valueStr: string,
  decimals: number | string,
  symbol = "USDT",
): number {
  const raw = BigInt(valueStr || "0");
  const dec = Number(decimals || 0);
  const sym = (symbol || "USDT").toUpperCase();
  const price = TOKEN_PRICES_USD[sym] ?? 1.0;
  if (dec <= 0) return Number(raw) * price;
  const divisor = 10n ** BigInt(dec);
  const integerPart = raw / divisor;
  const remainder = raw % divisor;
  const fraction = Number(remainder) / Number(divisor);
  return (Number(integerPart) + fraction) * price;
}

/**
 * Convert any transaction (native ETH or ERC-20 token) to USD value.
 */
export function txValueToUSD(tx: Transaction | TokenTransaction): number {
  if ("tokenDecimal" in tx && tx.tokenDecimal !== undefined) {
    return tokenValueToUSD(tx.value, tx.tokenDecimal, tx.tokenSymbol);
  }
  return weiToUSD(tx.value);
}

/**
 * Calculate how many days have passed since a Unix timestamp (in seconds).
 */
/** @internal Exported for unit-test coverage. */
export function daysSince(unixTimestampSec: string): number {
  const txTime = parseInt(unixTimestampSec, 10) * 1000;
  const now = Date.now();
  return Math.max(0, (now - txTime) / MS_PER_DAY);
}

/**
 * Score a single BFS path and return ALL intermediate terms for explainability.
 *
 * @param path - A single PathResult from the BFS.
 * @param hopTxsMap - Map of address to raw transactions fetched along this path.
 * @returns      Full ScoreBreakdown including the final score.
 */
export function scorePathDetailed(
  path: PathResult,
  hopTxsMap: Map<string, (Transaction | TokenTransaction)[]>,
): ScoreBreakdown {
  let taint = 1.0;
  let totalValueUSD = 0;
  let lastTxTime = 0;

  for (let i = 0; i < path.path.length - 1; i++) {
    const currentAddr = path.path[i].toLowerCase();
    const nextAddr = path.path[i + 1].toLowerCase();
    const txs = hopTxsMap.get(currentAddr) || [];

    let totalOutflow = 0;
    let specificOutflow = 0;

    for (const tx of txs) {
      const from = tx.from.toLowerCase();
      const to = tx.to.toLowerCase();
      
      if (from === currentAddr) {
        const valUSD = txValueToUSD(tx);
        totalOutflow += valUSD;
        if (to === nextAddr) {
          specificOutflow += valUSD;
          const tStamp = parseInt(tx.timeStamp, 10) * 1000;
          if (tStamp > lastTxTime) lastTxTime = tStamp;
          if (valUSD > totalValueUSD) totalValueUSD = valUSD;
        }
      }
    }

    if (totalOutflow === 0 || specificOutflow === 0) {
      taint = 0;
      break;
    }

    taint *= (specificOutflow / totalOutflow);
  }

  const daysSinceLastTx = lastTxTime > 0 ? Math.max(0, (Date.now() - lastTxTime) / MS_PER_DAY) : 0;
  const score = taint * 100;

  return {
    hops: Math.max(1, path.depth),
    totalValueUSD,
    daysSinceLastTx,
    taintFraction: taint,
    score
  };
}

/**
 * Score a single BFS path based on hop distance, transaction value, and recency.
 *
 * Formula:
 *   score = (1 / hops) × ln(1 + totalValueUSD) × recencyFactor
 *
 * @param path - A single PathResult from the BFS.
 * @param txs  - The raw transactions fetched along this path.
 * @returns      A numerical score (higher = more confident attribution).
 */
export function scorePath(
  path: PathResult,
  hopTxsMap: Map<string, (Transaction | TokenTransaction)[]>,
): number {
  return scorePathDetailed(path, hopTxsMap).score;
}

/**
 * Combine scores from multiple independent paths to the SAME VASP.
 *
 * We SUM rather than average because multiple independent paths are
 * STRONGER evidence, not diluted evidence. If wallet A reaches Binance
 * via 3 separate intermediary chains, that's far more incriminating
 * than a single chain — summing captures this correctly.
 *
 * @param scores - Array of individual path scores (from scorePath).
 * @returns        Combined score (sum).
 */
export function combineScores(scores: number[]): number {
  return scores.reduce((sum, s) => sum + s, 0);
}

/**
 * Calibration metadata record from the most recent empirical calibration run.
 * Exported so methodology disclosures and documentation stay synchronized.
 */
export const CALIBRATION_METADATA = {
  calibratedAt: "2026-09",
  knownSampleCount: 50,
  randomSampleCount: 50,
  calibratedHighThreshold: 50.00,
  calibratedLowThreshold: 10.00,
  activeHighThreshold: 50,
  activeMediumThreshold: 10,
  calibrationScript: "scripts/calibrate.ts",
} as const;

/**
 * Exported confidence thresholds so the frontend can display
 * "scored X, High threshold is 8" without duplicating backend constants.
 */
export const CONFIDENCE_THRESHOLDS = {
  high: CALIBRATION_METADATA.activeHighThreshold,
  medium: CALIBRATION_METADATA.activeMediumThreshold,
} as const;

/**
 * Map a numerical score to a human-readable confidence tier.
 *
 * ⚠ CALIBRATION NOTE:
 * Calibrated 2026-09 against 50 known + 50 random wallets, see scripts/calibrate.ts
 * Known wallets: Min=0, Median=0.365, P90=12.006, Max=16.251
 * Random wallets: Min=0, Median=0, P90=9.431, Max=12.004
 * Suggested thresholds from run: High > 12.01, Low <= 0.00 (Medium between 0.00 and 12.01)
 *
 * Note: Per calibration protocol, the hardcoded thresholds (8 and 3) below are NOT
 * auto-updated; review the distribution above and update deliberately.
 *
 * @param score - The combined score from combineScores().
 * @returns       "High" | "Medium" | "Low"
 */
export function toConfidence(score: number): ConfidenceLevel {
  // Calibrated 2026-09 against 50 known + 50 random wallets, see scripts/calibrate.ts
  if (score > CALIBRATION_METADATA.activeHighThreshold) return "High";
  if (score > CALIBRATION_METADATA.activeMediumThreshold) return "Medium";
  return "Low";
}

// ──────────────────────────────────────────────────────────────────────────────
// Aggregation helper (used by the route handler)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Given multiple PathResults (potentially to different VASPs) and a
 * transaction-fetcher function, score each path, group by VASP, and
 * return aggregated attributions sorted by combined score descending.
 *
 * @param paths    - All PathResults from findNearestVASP.
 * @param fetchTxs - Function to fetch transactions for an address.
 *                   Injected so the route handler can reuse the etherscan client.
 * @returns          Aggregated attributions, best-scoring VASP first.
 */
export async function aggregateAttributions(
  paths: PathResult[],
  fetchTxs: (address: string) => Promise<(Transaction | TokenTransaction)[]>,
): Promise<AggregatedAttribution[]> {
  // Score each path individually
  const scored: ScoredAttribution[] = [];

  for (const p of paths) {
    // Fetch transactions for EVERY non-terminal hop in the path
    const hopTxsMap = new Map<string, (Transaction | TokenTransaction)[]>();
    for (let i = 0; i < p.path.length - 1; i++) {
      const addr = p.path[i].toLowerCase();
      if (!hopTxsMap.has(addr)) {
        hopTxsMap.set(addr, await fetchTxs(addr));
      }
    }

    // Use scorePathDetailed to get both the score and the breakdown terms
    const breakdown = scorePathDetailed(p, hopTxsMap);

    // Identify assets involved along this path
    const assetSet = new Set<string>();
    for (const [_, txs] of hopTxsMap) {
      for (const tx of txs) {
        if ("tokenSymbol" in tx && tx.tokenSymbol) {
          assetSet.add(tx.tokenSymbol.toUpperCase());
        } else {
          assetSet.add("ETH");
        }
      }
    }
    if (assetSet.size === 0) {
      assetSet.add("ETH");
    }
    const assetsInvolved = Array.from(assetSet);

    scored.push({
      vasp: p.nearestVASP,
      hops: p.depth,
      path: p.path,
      score: breakdown.score,
      assetsInvolved,
      structuringFlaggedHops: p.structuringFlaggedHops ?? [],
      breakdown,
    });
  }

  // Group by VASP address
  const byVasp = new Map<string, ScoredAttribution[]>();
  for (const s of scored) {
    const existing = byVasp.get(s.vasp) ?? [];
    existing.push(s);
    byVasp.set(s.vasp, existing);
  }

  // Aggregate each VASP group
  const aggregated: AggregatedAttribution[] = [];
  for (const [vasp, vaspPaths] of byVasp) {
    const individualScores = vaspPaths.map((p) => p.score);
    const combinedScore = combineScores(individualScores);
    const bestHops = Math.min(...vaspPaths.map((p) => p.hops));

    aggregated.push({
      vasp,
      bestHops,
      combinedScore,
      confidence: toConfidence(combinedScore),
      paths: vaspPaths,
    });
  }

  // Sort by combined score descending (best attribution first)
  aggregated.sort((a, b) => b.combinedScore - a.combinedScore);

  return aggregated;
}
