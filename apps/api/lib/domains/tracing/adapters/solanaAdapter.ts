/**
 * lib/domains/tracing/adapters/solanaAdapter.ts
 *
 * Solana ChainAdapter using the Solscan public API.
 *
 * ### Data source
 * Solscan API: https://public-api.solscan.io
 * Env var: SOLSCAN_API_KEY (optional for public tier)
 *
 * ### Solana address format
 * Base58-encoded 32-byte Ed25519 public keys, 32–44 chars.
 * Example: 9Af2RXFNJ7GiT6XjfNWMDK4LX7JmVSJjBZM3bPe6h1A
 *
 * ### Account model
 * Solana is account-based (not UTXO). Each transaction has a list of
 * account keys (signers + non-signers) and instructions with transfers.
 * The Solscan /account/transactions endpoint returns simplified transfer
 * records — we use that rather than the raw RPC instruction parser.
 *
 * ### SPL Token support
 * Solana tokens (USDT, USDC, etc.) are SPL Token program transfers.
 * Solscan /account/token/txs returns these separately.
 *
 * @throws {BlockchainFetchError} on HTTP error, timeout, or rate limit.
 */

import type {
  ChainAdapter,
  NormalisedTransaction,
  KnownEntityResult,
  GetTransactionsOpts,
} from "../chainAdapter";
import { BlockchainFetchError } from "../chainAdapter";
import { lookupEntity } from "../entityStore";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SOLSCAN_BASE = "https://public-api.solscan.io";
const FETCH_TIMEOUT_MS = 10_000;
/** Approximate SOL → USD rate. Replace with live price post-MVP. */
const SOL_TO_USD = 100;
/** Lamports per SOL (Solana's base unit). */
const LAMPORTS_PER_SOL = 1_000_000_000;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function fetchTimeout(url: string, headers: Record<string, string> = {}): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: ctrl.signal, headers });
  } finally {
    clearTimeout(timer);
  }
}

function lamportsToUSD(lamports: number): number {
  return (lamports / LAMPORTS_PER_SOL) * SOL_TO_USD;
}

// ─────────────────────────────────────────────────────────────────────────────
// Solscan API types (subset)
// ─────────────────────────────────────────────────────────────────────────────

interface SolscanTx {
  txHash: string;
  src: string;
  dst: string;
  lamport: number;       // lamports transferred
  blockTime: number;    // unix seconds
  slot: number;
}

interface SolscanTokenTx {
  txHash: string;
  from: string;
  to: string;
  tokenAddress: string;
  tokenAmount: {
    amount: string;
    decimals: number;
    uiAmount: number;
    uiAmountString: string;
  };
  symbol: string;
  blockTime: number;
  slot: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// SolanaAdapter
// ─────────────────────────────────────────────────────────────────────────────

export class SolanaAdapter implements ChainAdapter {
  public readonly chain = "solana" as const;

  private readonly apiKey: string | undefined;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env.SOLSCAN_API_KEY;
    if (!this.apiKey) {
      console.warn("[SolanaAdapter] SOLSCAN_API_KEY not set — using public tier (may rate-limit)");
    }
  }

  private headers(): Record<string, string> {
    return this.apiKey ? { token: this.apiKey } : {};
  }

  async getTransactionsForAddress(
    address: string,
    opts: GetTransactionsOpts = {},
  ): Promise<NormalisedTransaction[]> {
    const limit = Math.min(opts.pageSize ?? 100, 50);
    const results: NormalisedTransaction[] = [];

    // ── SOL transfers ──────────────────────────────────────────────────────
    try {
      const url = `${SOLSCAN_BASE}/account/transactions?account=${address}&limit=${limit}`;
      const res = await fetchTimeout(url, this.headers());

      if (res.status === 429) {
        throw new BlockchainFetchError("solana", address, "Solscan rate limit (HTTP 429). Set SOLSCAN_API_KEY.");
      }
      if (!res.ok) {
        throw new BlockchainFetchError("solana", address, `Solscan HTTP ${res.status}: ${res.statusText}`);
      }

      const txs = await res.json() as SolscanTx[];
      const addrLower = address.toLowerCase();

      for (const tx of (Array.isArray(txs) ? txs : [])) {
        if (opts.outgoingOnly && tx.src.toLowerCase() !== addrLower) continue;
        results.push({
          txHash: tx.txHash,
          from: tx.src.toLowerCase(),
          to: tx.dst.toLowerCase(),
          amountRaw: String(tx.lamport),
          amountUSD: lamportsToUSD(tx.lamport),
          timestamp: new Date(tx.blockTime * 1000).toISOString(),
          timestampSec: tx.blockTime,
          chain: "solana",
          asset: "SOL",
          blockNumber: String(tx.slot),
        });
      }
    } catch (err) {
      if (err instanceof BlockchainFetchError) throw err;
      throw new BlockchainFetchError("solana", address, err instanceof Error ? err.message : String(err));
    }

    // ── SPL Token transfers ────────────────────────────────────────────────
    try {
      const url = `${SOLSCAN_BASE}/account/token/txs?address=${address}&offset=0&limit=${Math.min(limit, 20)}`;
      const res = await fetchTimeout(url, this.headers());
      if (res.ok) {
        const body = await res.json() as { data?: SolscanTokenTx[] };
        const tokenTxs: SolscanTokenTx[] = body.data ?? [];
        const addrLower = address.toLowerCase();

        for (const tx of tokenTxs) {
          if (opts.outgoingOnly && tx.from.toLowerCase() !== addrLower) continue;
          // uiAmount is the human-readable amount (already decimals-adjusted)
          const uiAmount = tx.tokenAmount?.uiAmount ?? 0;
          results.push({
            txHash: tx.txHash,
            from: tx.from.toLowerCase(),
            to: tx.to.toLowerCase(),
            amountRaw: tx.tokenAmount?.amount ?? "0",
            amountUSD: uiAmount, // USDC/USDT peg ≈ 1:1 USD; best effort
            timestamp: new Date(tx.blockTime * 1000).toISOString(),
            timestampSec: tx.blockTime,
            chain: "solana",
            asset: tx.symbol || "SPL",
            blockNumber: String(tx.slot),
          });
        }
      }
    } catch {
      console.warn(`[SolanaAdapter] SPL token fetch failed for ${address} — native SOL results only`);
    }

    return results;
  }

  async isKnownEntity(address: string): Promise<KnownEntityResult | null> {
    return lookupEntity(address, "solana");
  }
}
