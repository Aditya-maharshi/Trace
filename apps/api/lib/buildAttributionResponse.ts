/**
 * lib/buildAttributionResponse.ts
 *
 * Shared pipeline: BFS PathResults → full AttributionResponse.
 *
 * Both /api/attribute (non-streaming) and /api/attribute-stream (SSE) call
 * this function so they can never drift out of sync.
 */

import {
  ALLOWED_TOKEN_CONTRACTS,
  buildGraphVisualizationPayload,
  type BfsResult,
} from "./graphBuilder";
import { getTransactions, getTokenTransactions } from "./etherscan";
import { buildVaspSet, labelFor } from "./vaspLabels";
import {
  aggregateAttributions,
  type AggregatedAttribution,
  CONFIDENCE_THRESHOLDS,
} from "./attribution";
import { riskFlagPath } from "./sanctions";
import { resolveENSBatch } from "./ens";
import { buildMixerSet, detectMixerExposure } from "./mixerLabels";
import { getMethodologyDisclosure } from "./methodology";
import { requestContextStorage } from "./logger";

// ──────────────────────────────────────────────────────────────────────────────
// Response types (duplicated from attribute/route.ts for shared use)
// ──────────────────────────────────────────────────────────────────────────────

import type { 
  TopVaspEntry, 
  AttributionResponse,
  BridgeExitPoint,
  ScoredAttribution,
  MethodologyDisclosure
} from "../../../packages/shared-types";

// ──────────────────────────────────────────────────────────────────────────────
// Main pipeline function
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Convert raw BFS results into a complete AttributionResponse.
 * This is the single source of truth for the attribution pipeline logic.
 *
 * @param address - The original wallet address queried.
 * @param paths   - The BfsResult returned by findNearestVASP.
 * @returns         Full AttributionResponse ready to send to the client.
 */
export async function buildAttributionResponse(
  address: string,
  paths: BfsResult,
): Promise<AttributionResponse> {
  const bridgeExitPoints = paths.bridgeExitPoints ?? [];
  const traceExitedToBridge = paths.traceExitedToBridge ?? false;
  const incompleteTraversal = {
    skippedNodes: paths.incompleteTraversal?.skippedNodes ?? 0,
  };

  const ctx = requestContextStorage.getStore();
  const dataSource = ctx?.dataSource || "live";

  const mixerSet = buildMixerSet();

  // ── No VASP found ──────────────────────────────────────────────────────────
  if (paths.length === 0) {
    return {
      wallet: address.toLowerCase(),
      nearestVasp: null,
      nearestVaspLabel: null,
      hops: null,
      confidence: null,
      score: null,
      paths: [],
      risk: "LOW",
      structuringSignalDetected: false,
      sanctionsDetail: [],
      ensNames: {},
      mixerExposure: [],
      confidenceThresholds: CONFIDENCE_THRESHOLDS,
      topVasps: [],
      bridgeExitPoints,
      traceExitedToBridge,
      incompleteTraversal,
      methodology: getMethodologyDisclosure(),
      dataSource,
      dataProvenance: paths.dataProvenance || { source: "live-etherscan", fetchedAt: new Date().toISOString() },
      graph: await buildGraphVisualizationPayload([]),
    };
  }

  // ── Score and aggregate paths per VASP ────────────────────────────────────
  const fetchAllTxs = async (addr: string) => {
    const [ethTxsResult, tokenTxsResult] = await Promise.all([
      getTransactions(addr).catch(() => ({ data: [], provenance: { source: "fixture-cache", fetchedAt: new Date().toISOString() } } as any)),
      getTokenTransactions(addr).catch(() => ({ data: [], provenance: { source: "fixture-cache", fetchedAt: new Date().toISOString() } } as any)),
    ]);
    const allowed = tokenTxsResult.data.filter((t: any) =>
      ALLOWED_TOKEN_CONTRACTS.has(t.contractAddress.toLowerCase()),
    );
    return [...ethTxsResult.data, ...allowed];
  };

  const aggregated: AggregatedAttribution[] = await aggregateAttributions(
    paths,
    fetchAllTxs,
  );

  const best = aggregated[0];
  const allScoredPaths: ScoredAttribution[] = aggregated.flatMap((a) => a.paths);

  // ── Collect all addresses for ENS + mixer checks ──────────────────────────
  const allAddressSet = new Set<string>();
  for (const p of allScoredPaths) {
    for (const addr of p.path ?? []) {
      allAddressSet.add(addr.toLowerCase());
    }
  }
  const allAddresses = Array.from(allAddressSet);

  const mixerHits = detectMixerExposure(allScoredPaths, mixerSet);
  const mixerExposure = mixerHits.map(({ address: addr, label, hopIndex }) => ({
    address: addr,
    label,
    hopIndex,
  }));

  // ── Sanctions + ENS in parallel ───────────────────────────────────────────
  const winningPath = best.paths[0]?.path ?? [];
  let risk: "HIGH" | "LOW" = "LOW";
  let sanctionsDetail: Array<{ address: string; sanctioned: boolean }> = [];
  let ensNamesMap = new Map<string, string | null>();

  try {
    const [sanctionsResult, ensResult] = await Promise.all([
      riskFlagPath(winningPath),
      resolveENSBatch(allAddresses),
    ]);
    sanctionsDetail = sanctionsResult;
    ensNamesMap = ensResult;
    const anySanctioned = sanctionsDetail.some((f) => f.sanctioned);
    risk = anySanctioned || mixerExposure.length > 0 ? "HIGH" : "LOW";
  } catch (err) {
    console.error("[buildAttributionResponse] Sanctions/ENS check failed:", err);
    if (mixerExposure.length > 0) risk = "HIGH";
  }

  const ensNames: Record<string, string> = {};
  for (const [addr, name] of ensNamesMap.entries()) {
    if (name !== null) ensNames[addr] = name;
  }

  // ── Top-3 VASP candidates ─────────────────────────────────────────────────
  const top3 = aggregated.slice(0, 3);
  const topVasps: TopVaspEntry[] = await Promise.all(
    top3.map(async (candidate) => {
      const candidatePath = candidate.paths[0]?.path ?? [];
      let candidateRisk: "HIGH" | "LOW" = "LOW";
      try {
        const [candSanctions] = await Promise.all([riskFlagPath(candidatePath)]);
        const candSanctioned = candSanctions.some((f) => f.sanctioned);
        const candMixerHits = detectMixerExposure(candidate.paths, mixerSet);
        candidateRisk = candSanctioned || candMixerHits.length > 0 ? "HIGH" : "LOW";
      } catch {
        // non-fatal
      }
      return {
        vasp: candidate.vasp,
        vaspLabel: labelFor(candidate.vasp) ?? null,
        bestHops: candidate.bestHops,
        confidence: candidate.confidence,
        combinedScore: Math.round(candidate.combinedScore * 1000) / 1000,
        risk: candidateRisk,
      };
    }),
  );

  // ── Build final response ───────────────────────────────────────────────────
  const structuringSignalDetected = best.paths.some(
    (p) => (p.structuringFlaggedHops?.length ?? 0) > 0,
  );

  return {
    wallet: address.toLowerCase(),
    nearestVasp: best.vasp,
    nearestVaspLabel: labelFor(best.vasp) ?? null,
    hops: best.bestHops,
    confidence: best.confidence,
    score: Math.round(best.combinedScore * 1000) / 1000,
    paths: allScoredPaths,
    risk,
    structuringSignalDetected,
    sanctionsDetail,
    ensNames,
    mixerExposure,
    confidenceThresholds: CONFIDENCE_THRESHOLDS,
    topVasps,
    bridgeExitPoints,
    traceExitedToBridge,
    incompleteTraversal,
    methodology: getMethodologyDisclosure(),
    dataSource,
    dataProvenance: paths.dataProvenance || { source: "live-etherscan", fetchedAt: new Date().toISOString() },
    graph: await buildGraphVisualizationPayload(allScoredPaths),
  };
}
