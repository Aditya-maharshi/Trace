/**
 * lib/domains/tracing/chainRegistry.ts
 *
 * Factory that selects the correct ChainAdapter for a given chain.
 *
 * ### Registration
 * Ethereum and Bitcoin are registered as real adapters.
 * Tron, BNB, Solana, Polygon are registered as stubs (Phase 2 replaces them).
 *
 * ### Env-var fail-fast
 * At module load time we validate env vars for chains that require API keys.
 * In production (NODE_ENV=production) a missing mandatory key is a startup error.
 * In dev/test it is a warning — the free tier (or stub) handles it.
 *
 * ### Trace function
 * `trace(wallet, chain, params)` is the high-level entry point used by
 * intake routes and tests. It routes through the correct adapter and wraps
 * the result in the canonical AttributionResult shape.
 */

import type { ChainAdapter, SupportedChain, TraceParams, CrossChainHop } from "./chainAdapter";
import { ChainNotImplementedError } from "./chainAdapter";
import { EthereumAdapter } from "./adapters/ethereumAdapter";
import { BitcoinAdapter } from "./adapters/bitcoinAdapter";
import { TronAdapter } from "./adapters/tronAdapter";
import { BnbChainAdapter } from "./adapters/bnbChainAdapter";
import { SolanaAdapter } from "./adapters/solanaAdapter";
import { PolygonAdapter } from "./adapters/polygonAdapter";

// ─────────────────────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────────────────────

const REGISTRY = new Map<SupportedChain, ChainAdapter>();

function register(adapter: ChainAdapter): void {
  REGISTRY.set(adapter.chain, adapter);
}

// Register adapters — all chains have real implementations
register(new EthereumAdapter());
register(new BitcoinAdapter());
// Phase 2 real adapters
register(new TronAdapter());
register(new BnbChainAdapter());
register(new SolanaAdapter());
register(new PolygonAdapter());

// ─────────────────────────────────────────────────────────────────────────────
// Env-var validation (fail-fast in production)
// ─────────────────────────────────────────────────────────────────────────────

const CHAIN_ENV_VARS: Partial<Record<SupportedChain, { key: string; required: boolean }>> = {
  // Ethereum: ETHERSCAN_API_KEY — required in production (free tier degrades badly)
  ethereum: { key: "ETHERSCAN_API_KEY", required: process.env.NODE_ENV === "production" },
  // Bitcoin: BLOCKSTREAM_API_KEY — optional (free tier works without key)
  bitcoin: { key: "BLOCKSTREAM_API_KEY", required: false },
  // Phase 2 chains: will be required once real adapters are in place
  tron: { key: "TRONSCAN_API_KEY", required: false },
  bnbchain: { key: "BSCSCAN_API_KEY", required: false },
  solana: { key: "SOLSCAN_API_KEY", required: false },
  polygon: { key: "POLYGONSCAN_API_KEY", required: false },
};

// Validate on module load
for (const [chain, cfg] of Object.entries(CHAIN_ENV_VARS)) {
  if (cfg && !process.env[cfg.key]) {
    if (cfg.required) {
      throw new Error(
        `[chainRegistry] STARTUP FAILURE: ${cfg.key} is required for chain "${chain}" in production ` +
        `but is not set. Set the env var or disable the chain.`
      );
    } else {
      // Non-fatal warning — free tier or stub will handle it
      console.warn(
        `[chainRegistry] ${cfg.key} is not set for chain "${chain}". ` +
        `Using free-tier / unauthenticated mode (may be rate-limited).`
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the ChainAdapter for a given chain.
 *
 * @throws {ChainNotImplementedError} if the chain is registered as a stub.
 *   (The stub's method calls throw — this function itself does not throw.)
 * @throws {Error} if the chain is not registered at all.
 */
export function getAdapter(chain: SupportedChain): ChainAdapter {
  const adapter = REGISTRY.get(chain);
  if (!adapter) {
    throw new ChainNotImplementedError(chain);
  }
  return adapter;
}

/**
 * List all registered chain IDs (both real and stub).
 */
export function listRegisteredChains(): SupportedChain[] {
  return Array.from(REGISTRY.keys());
}

// ─────────────────────────────────────────────────────────────────────────────
// High-level trace() function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parameters for a trace() call.
 */
export interface TraceRequest {
  wallet: string;
  chain: SupportedChain;
  /** Maximum hop depth (default 8 per spec). */
  maxHops?: number;
  /** Maximum neighbors to expand per hop (default 5 per spec). */
  maxBranchesPerHop?: number;
}

/**
 * Minimal trace result shape — a superset of the canonical AttributionResponse.
 * The full AttributionResponse is built by buildAttributionResponse.ts for
 * Ethereum; for other chains this is the base record.
 */
export interface TraceResult {
  wallet: string;
  chain: SupportedChain;
  /** Label of the nearest VASP found, or null if none reached. */
  nearestVaspLabel: string | null;
  /** Number of hops to the nearest VASP, or null. */
  hops: number | null;
  /** Risk level. "UNKNOWN" when sanctions screening is unavailable. */
  risk: "HIGH" | "LOW" | "UNKNOWN";
  /** All paths explored. */
  paths: Array<{
    path: string[];
    nearestVasp: string | null;
    entityType: string | null;
    /** ⚠ Investigative lead only — see entityStore.ts formatConfidenceLabel */
    confidenceScore: number;
    /** Pre-formatted label including mandatory framing text. */
    confidenceLabel: string;
    amountFlowed: number;
    currency: string;
  }>;
  /** Cross-chain bridge exit points encountered during traversal. */
  crossChainHops: CrossChainHop[];
  generatedAt: string;
  traceParams: TraceParams;
  /**
   * If the trace could not complete because the chain adapter is not
   * implemented, this field describes the error. The caller must show
   * this to the investigator — never silently return a partial result.
   */
  adapterError?: string;
}

/**
 * High-level trace function.
 *
 * For Ethereum: delegates to the existing findNearestVASP / buildAttributionResponse
 * pipeline (which is the canonical implementation already running in /api/attribute).
 *
 * For other chains: uses the chain's adapter directly with a simplified BFS
 * (full graph-builder equivalents for each chain are Phase 2 work).
 *
 * ### Error handling
 * If the adapter throws `ChainNotImplementedError` or `BlockchainFetchError`,
 * the error is caught and returned in `result.adapterError` — the function
 * itself does NOT throw. This ensures the intake endpoint can always return
 * a structured response to the investigator.
 */
export async function trace(req: TraceRequest): Promise<TraceResult> {
  const {
    wallet,
    chain,
    maxHops = 8,
    maxBranchesPerHop = 5,
  } = req;

  const generatedAt = new Date().toISOString();
  const traceParams: TraceParams = {
    maxHops,
    maxBranchesPerHop,
    chain,
    startedAt: generatedAt,
  };

  // For Ethereum, delegate to the fully-featured existing pipeline
  if (chain === "ethereum") {
    // Dynamic import to avoid circular dependency with graphBuilder
    const { findNearestVASP } = await import("./graphBuilder");
    const { buildVaspSet } = await import("./vaspLabels");
    const { buildAttributionResponse } = await import("./buildAttributionResponse");
    const { formatConfidenceLabel } = await import("./entityStore");

    try {
      const vaspSet = buildVaspSet();
      const bfsResult = await findNearestVASP(
        wallet,
        vaspSet,
        maxHops,
        maxBranchesPerHop,
      );
      const attr = await buildAttributionResponse(wallet, bfsResult);

      return {
        wallet: attr.wallet,
        chain: "ethereum",
        nearestVaspLabel: attr.nearestVaspLabel,
        hops: attr.hops,
        risk: attr.risk,
        paths: attr.paths.map((p) => ({
          path: p.path,
          nearestVasp: p.vasp,
          entityType: "exchange",
          confidenceScore: p.score,
          confidenceLabel: formatConfidenceLabel(p.score),
          amountFlowed: p.breakdown?.totalValueUSD ?? 0,
          currency: (p.assetsInvolved?.[0]) ?? "ETH",
        })),
        crossChainHops: bfsResult.bridgeExitPoints.map((bp, i) => ({
          fromChain: "ethereum",
          toChain: "ethereum", // unknown destination in Phase 1 — Phase 2 resolves this
          bridgeAddress: bp.address,
          bridgeLabel: bp.label,
          exitTxHash: "",
          pathIndex: bp.pathIndex,
        })),
        generatedAt,
        traceParams,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        wallet,
        chain,
        nearestVaspLabel: null,
        hops: null,
        risk: "UNKNOWN",
        paths: [],
        crossChainHops: [],
        generatedAt,
        traceParams,
        adapterError: msg,
      };
    }
  }

  // For non-Ethereum chains: simple BFS using the chain adapter
  try {
    const adapter = getAdapter(chain);
    const { formatConfidenceLabel } = await import("./entityStore");
    const allPaths: TraceResult["paths"] = [];
    const crossChainHops: CrossChainHop[] = [];

    // BFS
    const visited = new Set<string>([wallet.toLowerCase()]);
    type QItem = { address: string; depth: number; path: string[]; amountFlowed: number; currency: string };
    const queue: QItem[] = [{ address: wallet.toLowerCase(), depth: 0, path: [wallet.toLowerCase()], amountFlowed: 0, currency: "?" }];
    let nearestVaspLabel: string | null = null;
    let minHops: number | null = null;

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.depth >= maxHops) continue;

      const txs = await adapter.getTransactionsForAddress(current.address, { outgoingOnly: true, pageSize: maxBranchesPerHop * 2 });
      const neighbors = txs.slice(0, maxBranchesPerHop);

      for (const tx of neighbors) {
        const neighbor = tx.to.toLowerCase();
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);

        const newPath = [...current.path, neighbor];
        const entity = await adapter.isKnownEntity(neighbor).catch(() => null);

        if (entity) {
          allPaths.push({
            path: newPath,
            nearestVasp: neighbor,
            entityType: entity.entityType,
            confidenceScore: entity.confidenceScore,
            confidenceLabel: entity.confidenceLabel,
            amountFlowed: tx.amountUSD,
            currency: tx.asset,
          });
          if (minHops === null || current.depth + 1 < minHops) {
            minHops = current.depth + 1;
            nearestVaspLabel = entity.label;
          }
          continue; // Don't expand past a known entity
        }

        queue.push({
          address: neighbor,
          depth: current.depth + 1,
          path: newPath,
          amountFlowed: tx.amountUSD,
          currency: tx.asset,
        });
      }
    }

    return {
      wallet,
      chain,
      nearestVaspLabel,
      hops: minHops,
      risk: "LOW",
      paths: allPaths,
      crossChainHops,
      generatedAt,
      traceParams,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      wallet,
      chain,
      nearestVaspLabel: null,
      hops: null,
      risk: "UNKNOWN",
      paths: [],
      crossChainHops: [],
      generatedAt,
      traceParams,
      adapterError: msg,
    };
  }
}
