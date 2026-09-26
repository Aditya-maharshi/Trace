/**
 * lib/domains/tracing/adapters/stubAdapters.ts
 *
 * Stub ChainAdapter implementations for chains not yet fully implemented.
 *
 * ### Design contract
 * Every stub throws `ChainNotImplementedError` at the FIRST method call —
 * not at construction time and not as a silent null return.
 *
 * This is intentional: the caller (graphBuilder / trace) must receive a
 * typed, loud error so it can propagate the failure to the investigator's
 * UI ("Chain not available") rather than returning an empty or fabricated
 * trace result.
 *
 * ### Upgrade path
 * Replace each stub with a real adapter in the corresponding file
 * (tronAdapter.ts, bnbChainAdapter.ts, etc.) and update chainRegistry.ts.
 * The interface is stable — no calling code needs to change.
 *
 * Phase 2 of this build replaces these stubs with real implementations.
 */

import type {
  ChainAdapter,
  NormalisedTransaction,
  KnownEntityResult,
  GetTransactionsOpts,
  SupportedChain,
} from "../chainAdapter";
import { ChainNotImplementedError } from "../chainAdapter";

// ─────────────────────────────────────────────────────────────────────────────
// Generic stub base
// ─────────────────────────────────────────────────────────────────────────────

class StubAdapter implements ChainAdapter {
  constructor(public readonly chain: SupportedChain) {}

  async getTransactionsForAddress(
    _address: string,
    _opts?: GetTransactionsOpts,
  ): Promise<NormalisedTransaction[]> {
    throw new ChainNotImplementedError(this.chain);
  }

  async isKnownEntity(_address: string): Promise<KnownEntityResult | null> {
    throw new ChainNotImplementedError(this.chain);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Concrete stubs — one per chain
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tron stub.
 *
 * Real implementation (Phase 2): Tronscan API
 *   GET https://apilist.tronscan.org/api/transaction
 *   Env var: TRONSCAN_API_KEY
 *
 * Note: Tron addresses start with "T" (base58check) rather than "0x".
 * The real adapter will need address-format validation different from Ethereum.
 */
export class TronAdapter extends StubAdapter {
  constructor() { super("tron"); }
}

/**
 * BNB Chain stub.
 *
 * Real implementation (Phase 2): BscScan API
 *   GET https://api.bscscan.com/api
 *   Env var: BSCSCAN_API_KEY
 *
 * Note: BNB Chain uses the same Ethereum address format (0x…) because it
 * is an EVM chain. The real adapter will be very similar to EthereumAdapter,
 * but pointing to BscScan's endpoint with chain ID 56.
 */
export class BnbChainAdapter extends StubAdapter {
  constructor() { super("bnbchain"); }
}

/**
 * Solana stub.
 *
 * Real implementation (Phase 2): Solscan public API
 *   GET https://public-api.solscan.io/account/transactions
 *   Env var: SOLSCAN_API_KEY
 *
 * Note: Solana addresses are base58-encoded 32-byte public keys (44 chars).
 * The real adapter will need different address validation and a different
 * transaction model (accounts vs UTXO vs Ethereum account model).
 */
export class SolanaAdapter extends StubAdapter {
  constructor() { super("solana"); }
}

/**
 * Polygon (PoS) stub.
 *
 * Real implementation (Phase 2): Polygonscan API
 *   GET https://api.polygonscan.com/api
 *   Env var: POLYGONSCAN_API_KEY
 *
 * Note: Polygon PoS is EVM-compatible — same address format as Ethereum.
 * The real adapter will be nearly identical to EthereumAdapter with a
 * different base URL and chain ID.
 */
export class PolygonAdapter extends StubAdapter {
  constructor() { super("polygon"); }
}
