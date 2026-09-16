/**
 * lib/graphBuilder.ts
 *
 * BFS shortest-path search from an unknown wallet to the nearest known VASP
 * address on the Ethereum transaction graph.
 *
 * ─── WHY BFS GUARANTEES SHORTEST PATH ───────────────────────────────────────
 *
 * BFS explores the graph level-by-level (all depth-0 nodes, then all depth-1,
 * then depth-2, …). This means the very FIRST time we encounter a VASP node,
 * it is at the lowest possible depth — there cannot exist a shorter path that
 * we haven't already explored. DFS, by contrast, dives deep along one branch
 * first and may find a VASP at depth 5 while a depth-1 connection exists
 * elsewhere. BFS's hop-order exploration gives us an automatic shortest-path
 * guarantee in unweighted graphs (where each transaction hop has cost 1).
 *
 * ─── COMPLEXITY BOUND ───────────────────────────────────────────────────────
 *
 * With maxFanout=15 and maxDepth=3 the theoretical worst case is:
 *   15 + 15² + 15³ = 15 + 225 + 3375 = 3 615 nodes
 * Practically it's much less because the visited set prunes duplicates.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { BridgeExitPoint } from "../../../packages/shared-types";
import {
  getTransactions,
  getTokenTransactions,
  type Transaction,
  type TokenTransaction,
  type DataProvenance,
  type FetchResult,
} from "../tracing/etherscan";
import { txValueToUSD } from "../tracing/attribution";
import { buildBridgeSet, labelForBridge, isBridge } from "./bridgeLabels";
import { labelFor as labelForVasp } from "../tracing/vaspLabels";
import { mixerLabelFor } from "../tracing/mixerLabels";
import { checkSanctioned } from "../compliance/sanctions";


// ──────────────────────────────────────────────────────────────────────────────
// Canonical Token Allowlist
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Canonical Ethereum Mainnet token contract addresses for supported stablecoins.
 * Lowercased for case-insensitive matching.
 */
export const ALLOWED_TOKEN_CONTRACTS = new Set<string>([
  // USDT (Tether USD) - 6 decimals
  "0xdac17f958d2ee523a2206206994597c13d831ec7",
  // USDC (USD Coin) - 6 decimals
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  // DAI (Dai Stablecoin) - 18 decimals
  "0x6b175474e89094c44da98b954eedeac495271d0f",
]);

export type AnyTransaction = Transaction | TokenTransaction;

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Internal queue item used during BFS traversal.
 *
 * @property address - The Ethereum address being explored at this step.
 * @property depth   - How many hops away from `startWallet` this node is (0-indexed).
 * @property path    - The ordered list of addresses from `startWallet` to this node
 *                     (inclusive of both endpoints).
 */
export interface QueueItem {
  address: string;
  depth: number;
  path: string[];
  /** Indices into path[] where a hop was selected via structuring ranking. */
  structuringFlaggedHops?: number[];
}

/**
 * A single result returned when the BFS reaches a known VASP.
 *
 * @property address                - The original `startWallet` that initiated the search.
 * @property depth                  - Number of hops from `startWallet` to the VASP.
 * @property path                   - Full address chain from `startWallet` → … → VASP (inclusive).
 * @property nearestVASP            - The VASP address that was found.
 * @property structuringFlaggedHops - Indices into path[] where a hop was selected via structuring ranking.
 */
export interface PathResult {
  address: string;
  depth: number;
  path: string[];
  nearestVASP: string;
  structuringFlaggedHops?: number[];
}

/**
 * Information regarding nodes that were skipped due to fetch failures.
 */
export interface IncompleteTraversalInfo {
  skippedNodes: number;
  skippedAddresses: string[];
  timeoutReached?: boolean;
  historyTruncated?: boolean;
  historyTruncatedAddresses?: string[];
}

/**
 * Return type of findNearestVASP, extending PathResult[] with bridge exit and traversal completeness metadata.
 */
export interface BfsResult extends Array<PathResult> {
  bridgeExitPoints: BridgeExitPoint[];
  mixerExposures: Array<{ address: string; hopIndex: number }>;
  traceExitedToBridge: boolean;
  incompleteTraversal: IncompleteTraversalInfo;
  dataProvenance?: DataProvenance;
}

/**
 * Discriminated union of BFS progress events emitted during traversal.
 * Consumed by the streaming /api/attribute-stream route via onProgress callback.
 */
export type BfsProgressEvent =
  | { type: "exploring"; address: string; depth: number; queueLength: number }
  | { type: "fetched"; address: string; txCount: number; neighborCount: number }
  | { type: "vasp_found"; address: string; depth: number; path: string[] }
  | { type: "pruned"; address: string; reason: "maxDepth" | "fetch_error" }
  | { type: "done"; totalVisited: number; resultsFound: number };

/**
 * A neighbor extracted from a set of transactions, aggregated by address.
 * Tracks total values, transaction count, amounts, and timestamps for
 * both value ranking and structuring detection.
 */
export interface AggregatedNeighbor {
  address: string;
  totalValue: bigint;
  totalValueUSD: number;
  txCount: number;
  amountsUSD: number[];
  timestampsSec: number[];
}

// ──────────────────────────────────────────────────────────────────────────────
// Debug utility — gated behind the DEBUG env var
// ──────────────────────────────────────────────────────────────────────────────

const DEBUG_ENABLED = Boolean(process.env.DEBUG);

/**
 * BFS wall-clock budget. Vercel Hobby kills functions at 10s, so on Vercel we
 * stop well before that and return a partial result instead of a raw 504.
 * Override with BFS_BUDGET_MS (milliseconds).
 */
export function resolveBfsBudgetMs(): number {
  const override = Number(process.env.BFS_BUDGET_MS);
  if (Number.isFinite(override) && override > 0) {
    return override;
  }
  if (process.env.VERCEL) {
    return 7_000;
  }
  return 20_000;
}

function normalizeTxFetch<T>(
  result: FetchResult<T> | T[] | undefined | null,
): FetchResult<T> {
  if (!result) {
    return {
      data: [],
      provenance: { source: "fixture-cache", fetchedAt: new Date().toISOString() },
      truncated: false,
    };
  }
  if (Array.isArray(result)) {
    return {
      data: result,
      provenance: { source: "fixture-cache", fetchedAt: new Date().toISOString() },
      truncated: false,
    };
  }
  return {
    data: result.data ?? [],
    provenance: result.provenance ?? {
      source: "fixture-cache",
      fetchedAt: new Date().toISOString(),
    },
    truncated: Boolean(result.truncated),
  };
}

/**
 * Conditional logger: only prints when DEBUG env var is set.
 * Use `DEBUG=1 npx ts-node …` to enable during hackathon debugging.
 */
function debug(message: string): void {
  if (DEBUG_ENABLED) {
    console.log(`[graphBuilder] ${message}`);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Helper functions
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Extract every unique counter-party address from a list of transactions
 * relative to `currentAddress`. For each neighbor, aggregate the total
 * transaction value (raw sum) so we can rank.
 *
 * A transaction where `from === currentAddress` gives us `to` as neighbor,
 * and vice-versa. Self-transactions (from === to) are skipped.
 */
/** @internal Exported for unit-test coverage. */
export function extractNeighbors(
  transactions: AnyTransaction[],
  currentAddress: string,
): Map<string, bigint> {
  const neighborMap = new Map<string, bigint>();
  const current = currentAddress.toLowerCase();

  for (const tx of transactions) {
    const from = tx.from.toLowerCase();
    const to = tx.to.toLowerCase();

    // Skip self-transactions
    if (from === to) continue;

    // Determine the neighbor (the "other side" of the transaction)
    let neighbor: string | null = null;
    if (from === current) {
      neighbor = to;
    } else if (to === current) {
      neighbor = from;
    }

    if (neighbor) {
      const value = BigInt(tx.value || "0");
      const existing = neighborMap.get(neighbor) ?? 0n;
      neighborMap.set(neighbor, existing + value);
    }
  }

  return neighborMap;
}

/**
 * Extract every unique counter-party address from a list of transactions,
 * normalizing values (ETH and ERC-20 tokens) to comparable USD units
 * and capturing txCount, amounts, and timestamps in a single pass.
 */
/** @internal Exported for unit-test coverage. */
export function extractNormalizedNeighbors(
  transactions: AnyTransaction[],
  currentAddress: string,
): Map<string, AggregatedNeighbor> {
  const neighborMap = new Map<string, AggregatedNeighbor>();
  const current = currentAddress.toLowerCase();

  for (const tx of transactions) {
    const from = tx.from.toLowerCase();
    const to = tx.to.toLowerCase();

    // Skip self-transactions
    if (from === to) continue;

    // Determine the neighbor (the "other side" of the transaction)
    let neighbor: string | null = null;
    if (from === current) {
      neighbor = to;
    } else if (to === current) {
      neighbor = from;
    }

    if (neighbor) {
      const valueUSD = txValueToUSD(tx);
      const rawVal = BigInt(tx.value || "0");
      const ts = parseInt(tx.timeStamp || "0", 10);
      const existing = neighborMap.get(neighbor);
      if (existing) {
        existing.totalValue += rawVal;
        existing.totalValueUSD += valueUSD;
        existing.txCount += 1;
        existing.amountsUSD.push(valueUSD);
        existing.timestampsSec.push(ts);
      } else {
        neighborMap.set(neighbor, {
          address: neighbor,
          totalValue: rawVal,
          totalValueUSD: valueUSD,
          txCount: 1,
          amountsUSD: [valueUSD],
          timestampsSec: [ts],
        });
      }
    }
  }

  return neighborMap;
}

/**
 * Take a map of neighbor → totalValue (bigint, number, or AggregatedNeighbor),
 * sort descending by value, and return only the top `maxFanout` addresses.
 */
/** @internal Exported for unit-test coverage. */
export function rankNeighborsByValue(
  neighborMap: Map<string, bigint | number | AggregatedNeighbor>,
  maxFanout: number,
): string[] {
  const sorted = Array.from(neighborMap.entries(), ([address, val]) => {
    let totalValue: number | bigint = 0;
    if (typeof val === "object" && val !== null) {
      const rec = val as { totalValueUSD?: number; totalValue?: bigint | number };
      totalValue = rec.totalValueUSD ?? rec.totalValue ?? 0;
    } else {
      totalValue = val;
    }
    return { address, totalValue };
  });

  // Sort descending by totalValue (biggest flows first)
  sorted.sort((a, b) => {
    if (b.totalValue > a.totalValue) return 1;
    if (b.totalValue < a.totalValue) return -1;
    return 0;
  });

  return sorted.slice(0, maxFanout).map((n) => n.address);
}

/**
 * Compute structuring score for an aggregated neighbor.
 *
 * Formula:
 *   score = txCount × amountSimilarity × timeClustering
 *
 * Where:
 *   - Requires txCount >= 2 (single transfers cannot be structured)
 *   - amountSimilarity = 1 / (1 + CV), where CV = stdDev / mean of USD amounts
 *     (near 1.0 when transfers are identical in size, approaching 0 when wildly varying)
 *   - timeClustering = 1 / (1 + spanDays), where spanDays = (maxTime - minTime) in days
 *     (near 1.0 when transfers occur within hours, decaying as time spans across days/months)
 */
export function computeStructuringScore(neighbor: AggregatedNeighbor): number {
  if (neighbor.txCount < 2) return 0;

  const n = neighbor.amountsUSD.length;
  const mean = neighbor.totalValueUSD / n;
  if (mean <= 0) return 0;

  // Variance and Coefficient of Variation (CV)
  const variance =
    neighbor.amountsUSD.reduce((sum, a) => sum + Math.pow(a - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / mean;
  const amountSimilarity = 1 / (1 + cv);

  // Time clustering: time span between earliest and latest tx
  const minTime = Math.min(...neighbor.timestampsSec);
  const maxTime = Math.max(...neighbor.timestampsSec);
  const spanDays = Math.max(0, (maxTime - minTime) / 86400);
  const timeClustering = 1 / (1 + spanDays);

  return neighbor.txCount * amountSimilarity * timeClustering;
}

/**
 * Rank neighbors by structuring signal score descending.
 * Only returns neighbors with positive structuring signal (txCount >= 2).
 */
export function rankNeighborsByStructuringSignal(
  neighborMap: Map<string, AggregatedNeighbor>,
  maxFanout: number,
): string[] {
  const scored = Array.from(neighborMap.values())
    .map((neighbor) => ({
      address: neighbor.address,
      score: computeStructuringScore(neighbor),
    }))
    .filter((s) => s.score > 0);

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, maxFanout).map((s) => s.address);
}

// ──────────────────────────────────────────────────────────────────────────────
// Main BFS function
// ──────────────────────────────────────────────────────────────────────────────

/**
 * BFS shortest-path search from `startWallet` to the nearest known VASP address.
 *
 * @param startWallet - The unknown wallet to trace from.
 * @param vaspSet     - Set of known VASP addresses (must be lowercased).
 * @param maxDepth    - Maximum number of hops to explore (default 3).
 * @param maxFanout   - At each node, only expand the top N neighbors by tx value
 *                      (default 15). This prevents exponential blowup.
 * @returns             Array of PathResult — one entry per VASP found within maxDepth.
 *                      Results are naturally ordered shortest-first because BFS
 *                      explores hop-by-hop.
 *
 * ### BFS Correctness
 *
 * BFS processes nodes in strict FIFO order. All depth-d nodes are dequeued
 * before any depth-(d+1) node. Therefore, the first time a VASP is encountered
 * it is guaranteed to be at the minimum possible hop distance. We still continue
 * the BFS to find ALL VASPs within `maxDepth`, but the first result is always
 * the nearest one.
 *
 * ### Cycle Prevention
 *
 * We add an address to `visited` at ENQUEUE time (not dequeue time). This is
 * critical: if we waited until dequeue, the same address could be enqueued
 * multiple times from different parents, wasting work and potentially causing
 * A→B→A loops.
 */
export async function findNearestVASP(
  startWallet: string,
  vaspSet: Set<string>,
  maxDepth = 3,
  maxFanout = 15,
  bridgeSet: Set<string> = buildBridgeSet(),
  onProgress?: (event: BfsProgressEvent) => void,
): Promise<BfsResult> {
  const start = startWallet.toLowerCase();
  const results: PathResult[] = [];
  const bridgeExitPoints: BridgeExitPoint[] = [];
  const skippedAddresses: string[] = [];
  const historyTruncatedAddresses: string[] = [];
  let timeoutReached = false;
  let rootProvenance: DataProvenance | undefined = undefined;
  const searchStartTime = Date.now();
  const MAX_BUDGET_MS = resolveBfsBudgetMs();

  const makeResult = (): BfsResult => {
    return Object.assign(results, {
      bridgeExitPoints,
      traceExitedToBridge: bridgeExitPoints.length > 0,
      incompleteTraversal: {
        skippedNodes: skippedAddresses.length,
        skippedAddresses,
        timeoutReached,
        historyTruncated: historyTruncatedAddresses.length > 0,
        historyTruncatedAddresses,
      },
      dataProvenance: rootProvenance,
    });
  };

  function isCollaborativeSpend(txs: AnyTransaction[], currentAddr: string): boolean {
    const inputs = new Set<string>();
    const outputs = new Set<string>();
    const outputValues = new Set<string>();

    const addrLower = currentAddr.toLowerCase();

    for (const tx of txs) {
      const from = tx.from.toLowerCase();
      const to = tx.to.toLowerCase();
      if (to === addrLower) {
        inputs.add(from);
      } else if (from === addrLower) {
        outputs.add(to);
        outputValues.add(tx.value);
      }
    }

    return inputs.size > 2 && outputs.size > 2 && outputValues.size > 2;
  }

  // ── STEP 1: Initialize BFS structures ──────────────────────────────────

  const visited = new Set<string>();
  visited.add(start);
  
  const mixerExposures: Array<{ address: string; hopIndex: number }> = [];

  const queue: QueueItem[] = [
    {
      address: start,
      depth: 0,
      path: [start],
      structuringFlaggedHops: [],
    },
  ];

  debug(`Starting BFS from ${start}, maxDepth=${maxDepth}, maxFanout=${maxFanout}`);

  // Check if the start wallet itself is a VASP (edge case)
  if (vaspSet.has(start)) {
    debug(`Start wallet ${start} is itself a known VASP — returning immediately`);
    results.push({
      address: start,
      depth: 0,
      path: [start],
      nearestVASP: start,
      structuringFlaggedHops: [],
    });
    return makeResult();
  }

  // Check if the start wallet itself is a cross-chain bridge (edge case)
  if (bridgeSet.has(start)) {
    debug(`Start wallet ${start} is itself a known cross-chain bridge — returning immediately`);
    bridgeExitPoints.push({
      address: start,
      label: labelForBridge(start) || "Unknown Bridge",
      hopIndex: 0,
      pathIndex: 0,
    });
    return makeResult();
  }

  // ── STEP 2: BFS loop ──────────────────────────────────────────────────

  while (queue.length > 0) {
    if (Date.now() - searchStartTime >= MAX_BUDGET_MS) {
      debug(`Timeout budget (${MAX_BUDGET_MS}ms) reached. Aborting BFS early.`);
      timeoutReached = true;
      break;
    }

    // 1. Dequeue the next item (FIFO — this guarantees hop-order exploration)
    const current = queue.shift()!;

    debug(
      `Exploring depth ${current.depth}, ${queue.length} nodes queued, ` +
        `visiting ${current.address.slice(0, 10)}…`,
    );
    onProgress?.({ type: "exploring", address: current.address, depth: current.depth, queueLength: queue.length });

    // 2. Check if this node is a VASP → record it and do NOT expand further.
    //    VASP nodes are dead ends for this search: we found what we were
    //    looking for, and expanding past an exchange would just give us
    //    the exchange's other customers (irrelevant noise).
    if (vaspSet.has(current.address)) {
      debug(`✓ Found VASP at depth ${current.depth}: ${current.address}`);
      onProgress?.({ type: "vasp_found", address: current.address, depth: current.depth, path: current.path });
      results.push({
        address: start,
        depth: current.depth,
        path: current.path,
        nearestVASP: current.address,
        structuringFlaggedHops: current.structuringFlaggedHops ?? [],
      });
      continue; // VASP is terminal — don't expand
    }

    // 2b. Check if this node is a cross-chain bridge → record exit point and do NOT expand further.
    //     Funds left Ethereum mainnet through this bridge; further Ethereum hops are irrelevant.
    if (bridgeSet.has(current.address)) {
      debug(`✓ Found Bridge exit at depth ${current.depth}: ${current.address}`);
      bridgeExitPoints.push({
        address: current.address,
        label: labelForBridge(current.address) || "Unknown Bridge",
        hopIndex: current.depth,
        pathIndex: bridgeExitPoints.length,
      });
      continue; // Bridge is terminal — funds exited cross-chain
    }

    // 3. Prune if we've reached the maximum allowed depth.
    //    Nodes AT maxDepth have already been checked for VASP above;
    //    we just don't expand their children.
    if (current.depth >= maxDepth) {
      debug(`⏹ Reached maxDepth=${maxDepth} at ${current.address.slice(0, 10)}… — pruning`);
      onProgress?.({ type: "pruned", address: current.address, reason: "maxDepth" });
      continue;
    }

    // 4. Fetch transactions (ETH and allowed ERC-20 tokens) for this address from Etherscan in parallel
    //    Re-check budget immediately before the network round-trip so a slow
    //    hop cannot start after the serverless deadline is already imminent.
    if (Date.now() - searchStartTime >= MAX_BUDGET_MS) {
      timeoutReached = true;
      break;
    }

    let transactions: AnyTransaction[];
    try {
      const [ethRaw, tokenRaw] = await Promise.all([
        getTransactions(current.address),
        getTokenTransactions(current.address).catch((err) => {
          debug(`⚠ getTokenTransactions failed for ${current.address.slice(0, 10)}…: ${err}`);
          return {
            data: [],
            provenance: { source: "fixture-cache", fetchedAt: new Date().toISOString() },
            truncated: false,
          } as FetchResult<TokenTransaction>;
        }),
      ]);

      const ethTxsResult = normalizeTxFetch(ethRaw);
      const tokenTxsResult = normalizeTxFetch(tokenRaw);

      if (ethTxsResult.truncated || tokenTxsResult.truncated) {
        historyTruncatedAddresses.push(current.address);
      }

      if (current.depth === 0 && !rootProvenance) {
        rootProvenance = ethTxsResult.provenance;
      }

      const filteredTokens = tokenTxsResult.data.filter((t) =>
        ALLOWED_TOKEN_CONTRACTS.has(t.contractAddress.toLowerCase()),
      );

      transactions = [...ethTxsResult.data, ...filteredTokens];
    } catch (err) {
      skippedAddresses.push(current.address);
      console.warn(
        `[graphBuilder] Node ${current.address} skipped due to transaction fetch failure: ${err}`,
      );
      debug(
        `⚠ getTransactions failed for ${current.address.slice(0, 10)}…: ${err}`,
      );
      onProgress?.({ type: "pruned", address: current.address, reason: "fetch_error" });
      continue;
    }

    debug(
      `  Fetched ${transactions.length} transactions (ETH + tokens) for ${current.address.slice(0, 10)}…`,
    );

    // 4.5. Pre-clustering filter for collaborative spends (CoinJoin / Unlabelled Mixers)
    // If the node acts as a mixer, we tag it and sever the branch (do not enqueue neighbors).
    if (isCollaborativeSpend(transactions, current.address) && current.depth > 0) {
      debug(`⚠ Detected collaborative spend / unlabelled mixer at depth ${current.depth}: ${current.address}. Severing branch.`);
      mixerExposures.push({ address: current.address, hopIndex: current.depth });
      onProgress?.({ type: "pruned", address: current.address, reason: "maxDepth" }); // Emitting as pruned for UI
      continue;
    }
    // Extract neighbor count from the upcoming neighborMap (we compute it just below)
    // We emit after extracting to have accurate counts
    const _neighborCountForProgress = (() => {
      // quick count — does not affect the real neighborMap computed below
      const seen = new Set<string>();
      const cur = current.address.toLowerCase();
      for (const tx of transactions) {
        const f = tx.from.toLowerCase(), t = tx.to.toLowerCase();
        if (f !== t) { if (f === cur) seen.add(t); else if (t === cur) seen.add(f); }
      }
      return seen.size;
    })();
    onProgress?.({ type: "fetched", address: current.address, txCount: transactions.length, neighborCount: _neighborCountForProgress });

    // 5. Extract all unique neighbors and aggregate their normalized USD transaction values & structuring stats
    const neighborMap = extractNormalizedNeighbors(transactions, current.address);

    // 6. Union ranking: split budget (e.g. 10 value, 5 structuring for maxFanout=15).
    //    This ensures structured flows are explored even when individual transfers
    //    would not win on raw USD value.
    const valueBudget = Math.max(1, Math.round(maxFanout * (2 / 3)));
    const structuringBudget = Math.max(1, maxFanout - valueBudget);

    const topValueNeighbors = rankNeighborsByValue(neighborMap, valueBudget);
    const topStructuringNeighbors = rankNeighborsByStructuringSignal(
      neighborMap,
      structuringBudget,
    );

    const valueSet = new Set(topValueNeighbors);
    const structuringOnlySet = new Set(
      topStructuringNeighbors.filter((addr) => !valueSet.has(addr)),
    );

    const combinedNeighbors = [
      ...topValueNeighbors,
      ...Array.from(structuringOnlySet),
    ].slice(0, maxFanout);

    debug(
      `  ${neighborMap.size} unique neighbors → ` +
        `top ${topValueNeighbors.length} by value, ` +
        `${structuringOnlySet.size} added by structuring signal → ` +
        `${combinedNeighbors.length} combined`,
    );

    // 7. Enqueue unvisited neighbors, tracking hops included via structuring
    for (const neighbor of combinedNeighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);

        const isStructuringHop = structuringOnlySet.has(neighbor);
        const hopIndex = current.path.length;
        const structuringFlaggedHops = isStructuringHop
          ? [...(current.structuringFlaggedHops ?? []), hopIndex]
          : (current.structuringFlaggedHops ?? []);

        queue.push({
          address: neighbor,
          depth: current.depth + 1,
          path: [...current.path, neighbor],
          structuringFlaggedHops,
        });
      }
    }
  }

  // ── STEP 3: Return results ─────────────────────────────────────────────

  debug(
    `BFS complete. Found ${results.length} VASP path(s), visited ${visited.size} nodes total.`,
  );
  onProgress?.({ type: "done", totalVisited: visited.size, resultsFound: results.length });

  const finalResult = results as BfsResult;
  finalResult.bridgeExitPoints = bridgeExitPoints;
  finalResult.mixerExposures = mixerExposures;
  finalResult.traceExitedToBridge = bridgeExitPoints.length > 0;
  finalResult.incompleteTraversal = {
    skippedNodes: skippedAddresses.length,
    skippedAddresses,
    timeoutReached,
    historyTruncated: historyTruncatedAddresses.length > 0,
    historyTruncatedAddresses,
  };
  finalResult.dataProvenance = rootProvenance;

  return finalResult;
}

export async function buildGraphVisualizationPayload(pathResults: { path: string[] }[]) {
  const nodes = new Map<string, { id: string; type: "wallet" | "vasp" | "mixer" | "bridge" | "sanctioned"; label?: string }>();
  const edges = new Map<string, { source: string; target: string; hopIndex: number; valueUSD: number; asset: string; timestamp: string }>();

  for (const pr of pathResults) {
    for (let i = 0; i < pr.path.length; i++) {
      const addr = pr.path[i].toLowerCase();
      
      let type: "wallet" | "vasp" | "mixer" | "bridge" | "sanctioned" = "wallet";
      let label: string | undefined = undefined;

      const isSanc = await checkSanctioned(addr);
      if (isSanc) {
        type = "sanctioned";
      } else if (labelForVasp(addr)) {
        type = "vasp";
        label = labelForVasp(addr);
      } else if (mixerLabelFor(addr)) {
        type = "mixer";
        label = mixerLabelFor(addr);
      } else if (isBridge(addr)) {
        type = "bridge";
        label = labelForBridge(addr);
      }

      if (!nodes.has(addr)) {
        nodes.set(addr, { id: addr, type, label });
      }

      if (i > 0) {
        const prev = pr.path[i - 1].toLowerCase();
        const edgeId = `${prev}-${addr}`;
        if (!edges.has(edgeId)) {
          edges.set(edgeId, {
            source: prev,
            target: addr,
            hopIndex: i,
            valueUSD: 0,
            asset: "ETH",
            timestamp: new Date().toISOString()
          });
        }
      }
    }
  }

  const nodesArr = Array.from(nodes.values());
  const edgesArr = Array.from(edges.values());
  const truncated = nodesArr.length > 50;

  return {
    nodes: nodesArr.slice(0, 50),
    edges: edgesArr.slice(0, 100),
    truncated
  };
}
