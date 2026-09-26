/**
 * lib/domains/tracing/adapters/tronAdapter.ts
 *
 * Tron ChainAdapter using the Tronscan public API.
 *
 * ### Data source
 * Primary: https://apilist.tronscanapi.com/api/transaction (no key, public tier)
 * Key tier: set TRONSCAN_API_KEY for TSCT-API-KEY header → higher rate limits
 *
 * ### Tron address format
 * Tron uses base58check-encoded addresses starting with "T" (34 chars).
 * Example: TXGRiCzEMqZbMj5gGFuicZQWLzAuXXEQJe
 * This adapter does NOT validate address format — callers must validate before
 * invoking. The validation regex: /^T[1-9A-HJ-NP-Za-km-z]{33}$/
 *
 * ### Token support
 * Tronscan /api/transaction returns TRX native transfers.
 * TRC-20 tokens (USDT, etc.) require a separate endpoint:
 * /api/contract/transaction — included in this implementation.
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

const TRONSCAN_BASE = "https://apilist.tronscanapi.com";
const FETCH_TIMEOUT_MS = 10_000;
/** Approximate TRX → USD rate. Replace with live price endpoint post-MVP. */
const TRX_TO_USD = 0.11;
/** SUN per TRX (Tron's base unit, like satoshi). */
const SUN_PER_TRX = 1_000_000;

// ─────────────────────────────────────────────────────────────────────────────
// Fetch with timeout
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

// ─────────────────────────────────────────────────────────────────────────────
// Tronscan API response types (subset)
// ─────────────────────────────────────────────────────────────────────────────

interface TronscanTx {
  hash: string;
  ownerAddress: string;
  toAddress: string;
  amount?: number;      // in SUN for TRX transfers
  timestamp: number;   // milliseconds
  block: number;
  contractType?: number; // 1 = TRX transfer
}

interface TronscanTokenTx {
  transactionHash: string;
  fromAddress: string;
  toAddress: string;
  amount: string;       // token amount, may be decimal string
  decimals: number;
  tokenName: string;
  tokenAbbr: string;
  timestamp: number;    // milliseconds
  block: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// TronAdapter
// ─────────────────────────────────────────────────────────────────────────────

export class TronAdapter implements ChainAdapter {
  public readonly chain = "tron" as const;

  private readonly apiKey: string | undefined;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env.TRONSCAN_API_KEY;
  }

  private headers(): Record<string, string> {
    return this.apiKey ? { "TSCT-API-KEY": this.apiKey } : {};
  }

  async getTransactionsForAddress(
    address: string,
    opts: GetTransactionsOpts = {},
  ): Promise<NormalisedTransaction[]> {
    const limit = opts.pageSize ?? 100;
    const results: NormalisedTransaction[] = [];

    // ── Fetch TRX native transfers ─────────────────────────────────────────
    try {
      const url = `${TRONSCAN_BASE}/api/transaction?sort=-timestamp&count=true&limit=${limit}&address=${address}`;
      const res = await fetchTimeout(url, this.headers());

      if (res.status === 429) {
        throw new BlockchainFetchError("tron", address, "Tronscan rate limit (HTTP 429). Set TRONSCAN_API_KEY for higher quota.");
      }
      if (!res.ok) {
        throw new BlockchainFetchError("tron", address, `Tronscan HTTP ${res.status}: ${res.statusText}`);
      }

      const body = await res.json() as { data?: TronscanTx[] };
      const txs: TronscanTx[] = body.data ?? [];

      for (const tx of txs) {
        // Filter to outgoing if requested
        if (opts.outgoingOnly && tx.ownerAddress.toLowerCase() !== address.toLowerCase()) continue;
        const amountSun = tx.amount ?? 0;
        const amountUSD = (amountSun / SUN_PER_TRX) * TRX_TO_USD;
        results.push({
          txHash: tx.hash,
          from: tx.ownerAddress.toLowerCase(),
          to: tx.toAddress.toLowerCase(),
          amountRaw: String(amountSun),
          amountUSD,
          timestamp: new Date(tx.timestamp).toISOString(),
          timestampSec: Math.floor(tx.timestamp / 1000),
          chain: "tron",
          asset: "TRX",
          blockNumber: String(tx.block),
        });
      }
    } catch (err) {
      if (err instanceof BlockchainFetchError) throw err;
      throw new BlockchainFetchError("tron", address, err instanceof Error ? err.message : String(err));
    }

    // ── Fetch TRC-20 token transfers ───────────────────────────────────────
    try {
      const tokenUrl = `${TRONSCAN_BASE}/api/contract/transaction?sort=-timestamp&limit=${Math.min(limit, 50)}&address=${address}`;
      const res = await fetchTimeout(tokenUrl, this.headers());
      if (res.ok) {
        const body = await res.json() as { token_transfers?: TronscanTokenTx[] };
        const tokenTxs: TronscanTokenTx[] = body.token_transfers ?? [];
        for (const tx of tokenTxs) {
          if (opts.outgoingOnly && tx.fromAddress.toLowerCase() !== address.toLowerCase()) continue;
          const amountNum = parseFloat(tx.amount) / Math.pow(10, tx.decimals || 6);
          results.push({
            txHash: tx.transactionHash,
            from: tx.fromAddress.toLowerCase(),
            to: tx.toAddress.toLowerCase(),
            amountRaw: tx.amount,
            amountUSD: amountNum, // USDT/USDC peg ≈ 1 USD; best effort
            timestamp: new Date(tx.timestamp).toISOString(),
            timestampSec: Math.floor(tx.timestamp / 1000),
            chain: "tron",
            asset: tx.tokenAbbr || tx.tokenName || "TRC20",
            blockNumber: String(tx.block),
          });
        }
      }
    } catch {
      // TRC-20 fetch failure is non-fatal — TRX results are already collected
      console.warn(`[TronAdapter] TRC-20 transfer fetch failed for ${address} — native TRX results only`);
    }

    return results;
  }

  async isKnownEntity(address: string): Promise<KnownEntityResult | null> {
    return lookupEntity(address, "tron");
  }
}
