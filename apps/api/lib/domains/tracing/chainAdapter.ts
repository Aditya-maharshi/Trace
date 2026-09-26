/**
 * lib/domains/tracing/chainAdapter.ts
 *
 * Canonical ChainAdapter interface for multi-chain blockchain tracing.
 *
 * Design: this is a SUPERSET of the existing `BlockchainDataProvider`
 * interface in etherscan.ts. Ethereum adapters delegate to the existing
 * EtherscanProvider / BlockscoutProvider implementations — no code is
 * duplicated. For chains not yet implemented (Tron, BNB, Solana, Polygon),
 * the stub adapter throws a `ChainNotImplementedError` at call time so
 * callers get a loud, typed failure rather than silently fabricated data.
 *
 * Swap rule: any paid intelligence API (Chainalysis KYT, TRM Labs, Elliptic)
 * can be plugged in by implementing this interface and registering it in
 * chainRegistry.ts. The calling code (graphBuilder / trace) never needs to
 * change.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Supported chains
// ─────────────────────────────────────────────────────────────────────────────

export type SupportedChain =
  | "ethereum"
  | "bitcoin"
  | "tron"
  | "bnbchain"
  | "solana"
  | "polygon";

// ─────────────────────────────────────────────────────────────────────────────
// Shared transaction shape (normalised across chains)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single normalised outgoing transaction from a wallet.
 * Bitcoin, Ethereum, Solana etc. map onto this shape.
 */
export interface NormalisedTransaction {
  /** Transaction ID / hash. */
  txHash: string;
  /** Sender address. */
  from: string;
  /** Recipient address. */
  to: string;
  /**
   * Amount transferred in the chain's base unit (satoshi, wei, lamport…).
   * Stored as a string to avoid JS number precision loss on large integers.
   */
  amountRaw: string;
  /**
   * Amount in USD (best-effort, using hardcoded rates for now).
   * Zero when conversion is unavailable.
   */
  amountUSD: number;
  /** ISO 8601 timestamp. */
  timestamp: string;
  /** Unix timestamp in seconds (for sorting / recency scoring). */
  timestampSec: number;
  /** Which chain this transaction belongs to. */
  chain: SupportedChain;
  /** The token/asset symbol (e.g. "ETH", "BTC", "USDT"). */
  asset: string;
  /** Block number or slot/sequence number. */
  blockNumber: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Entity lookup result
// ─────────────────────────────────────────────────────────────────────────────

export type EntityType =
  | "exchange"
  | "hot-wallet"
  | "deposit-wallet"
  | "mixer"
  | "bridge"
  | "darknet-market"
  | "sanctioned"
  | "unknown";

/**
 * Result of an entity lookup for a given address.
 *
 * ⚠ FRAMING REQUIREMENT (enforced here, not at display layer):
 * `confidenceScore` is an investigative lead, not a legal identification.
 * Every caller that surfaces this to an investigator MUST append the string
 * " — investigative lead, requires VASP confirmation" to any displayed value.
 * The `confidenceLabel` field includes that string pre-formatted.
 */
export interface KnownEntityResult {
  /** Lowercased address. */
  address: string;
  /** Human-readable label (e.g. "Binance Hot Wallet"). */
  label: string;
  /** Typed category of the entity. */
  entityType: EntityType;
  /**
   * Confidence score 0–100.
   * ⚠ Investigative lead only — see module-level docstring.
   */
  confidenceScore: number;
  /**
   * Pre-formatted label for display:
   * e.g. "82% confidence — investigative lead, requires VASP confirmation"
   */
  confidenceLabel: string;
  /** Which data source provided this label (e.g. "ofac-sdn", "manual-analyst-tag"). */
  source: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Options
// ─────────────────────────────────────────────────────────────────────────────

export interface GetTransactionsOpts {
  /** Maximum transactions to return. Defaults to 100. */
  pageSize?: number;
  /** Only include outgoing transactions (from === address). Default: false (both). */
  outgoingOnly?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Trace parameters (returned with every trace result for auditability)
// ─────────────────────────────────────────────────────────────────────────────

export interface TraceParams {
  maxHops: number;
  maxBranchesPerHop: number;
  chain: SupportedChain;
  startedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cross-chain hop type (Phase 2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Represents a point in a trace where funds moved from one chain to another
 * via a bridge / cross-chain swap service.
 * Added to AttributionResponse.crossChainHops[] when detected.
 */
export interface CrossChainHop {
  /** Chain funds left from. */
  fromChain: SupportedChain;
  /** Chain funds arrived on. */
  toChain: SupportedChain;
  /** The bridge contract / program address on the source chain. */
  bridgeAddress: string;
  /** Human-readable label for the bridge (e.g. "Wormhole: Portal Token Bridge"). */
  bridgeLabel: string;
  /** Transaction hash on the source chain where funds entered the bridge. */
  exitTxHash: string;
  /** Index in the full path array where this cross-chain hop occurs. */
  pathIndex: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Error types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Thrown when a `ChainAdapter` for the requested chain has not been implemented.
 * This is a LOUD failure — callers must not fall back to fake data.
 */
export class ChainNotImplementedError extends Error {
  constructor(public readonly chain: SupportedChain) {
    super(
      `ChainAdapter for chain "${chain}" is not yet implemented. ` +
      `This is a stub — no fabricated data will be returned. ` +
      `Implement the adapter in apps/api/lib/domains/tracing/adapters/${chain}Adapter.ts ` +
      `and register it in chainRegistry.ts.`
    );
    this.name = "ChainNotImplementedError";
  }
}

/**
 * Thrown when an external block-explorer API call fails (timeout, HTTP error,
 * invalid response). Callers must propagate this — never substitute fake data.
 */
export class BlockchainFetchError extends Error {
  constructor(
    public readonly chain: SupportedChain,
    public readonly address: string,
    public readonly cause: string,
  ) {
    super(
      `Blockchain data fetch failed for ${address} on ${chain}: ${cause}. ` +
      `The trace result is incomplete — no fabricated data was substituted.`
    );
    this.name = "BlockchainFetchError";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ChainAdapter interface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The canonical interface every chain-specific adapter must implement.
 *
 * ### Swap contract
 * Any paid intelligence API (Chainalysis KYT, TRM Labs, Elliptic) can replace
 * a public-explorer implementation by implementing this interface and
 * registering it in chainRegistry.ts. The rest of the tracing pipeline is
 * completely unaware of which data source is in use.
 *
 * ### Error contract
 * - If the underlying API is unreachable, throw `BlockchainFetchError`.
 * - If the chain is not yet implemented, throw `ChainNotImplementedError`.
 * - NEVER return fabricated or default data to mask an error.
 */
export interface ChainAdapter {
  /** The chain this adapter handles. */
  readonly chain: SupportedChain;

  /**
   * Return outgoing (and optionally all) transactions for `address`.
   *
   * @throws {BlockchainFetchError} if the underlying API is unreachable.
   */
  getTransactionsForAddress(
    address: string,
    opts?: GetTransactionsOpts,
  ): Promise<NormalisedTransaction[]>;

  /**
   * Look up whether `address` is a known entity in the labeled-entity store.
   *
   * @returns KnownEntityResult if found, null if the address is unknown.
   * @throws {BlockchainFetchError} if an external lookup is required and fails.
   */
  isKnownEntity(address: string): Promise<KnownEntityResult | null>;
}
