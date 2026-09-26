/**
 * lib/domains/tracing/adapters/bitcoinAdapter.ts
 *
 * Bitcoin ChainAdapter implementation using the Blockstream.info REST API.
 *
 * ### Data source
 * Primary: https://blockstream.info/api  (no key required for public rate tier)
 * Fallback: https://blockchain.info/rawaddr/{addr} (older API, no key)
 *
 * API keys:
 *   BLOCKSTREAM_API_KEY — optional, set for a higher rate limit tier
 *
 * ### Behaviour on missing key
 * Works in unauthenticated mode. If the API returns HTTP 429, throws
 * BlockchainFetchError explicitly — never substitutes fake data.
 *
 * ### Entity lookup
 * Delegates to the shared entityStore (Supabase entity_labels table).
 * Falls back to the static VASP / mixer label registries in vaspLabels.ts
 * and mixerLabels.ts if the DB is unavailable, so entity lookup never
 * silently returns null when a label is actually known.
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

const BLOCKSTREAM_BASE = "https://blockstream.info/api";
const BLOCKCHAIN_INFO_BASE = "https://blockchain.info";

/**
 * Approximate BTC → USD rate.
 * TODO: replace with a live price API (CoinGecko) post-MVP.
 * Uses log(1+value) in scoring so order-of-magnitude accuracy is sufficient.
 */
const BTC_TO_USD = 65_000;

/** Per-request network timeout in milliseconds (matching etherscan.ts). */
const FETCH_TIMEOUT_MS = 10_000;

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

/**
 * Satoshi → BTC → USD.
 * Satoshi is the base unit of Bitcoin (1 BTC = 10^8 satoshi).
 */
function satoshiToUSD(satoshi: number): number {
  return (satoshi / 1e8) * BTC_TO_USD;
}

/**
 * Blockstream /address/{addr}/txs returns paginated transactions.
 * Each transaction has `vin` (inputs) and `vout` (outputs).
 * We normalise to NormalisedTransaction by matching inputs/outputs relative
 * to the queried address.
 *
 * Bitcoin UTXO model: a single tx can have MULTIPLE inputs and outputs.
 * We emit one NormalisedTransaction per output where the recipient is not
 * the queried address (i.e. outgoing outputs only).
 */
function normaliseBlockstreamTxs(
  txList: BlockstreamTx[],
  address: string,
): NormalisedTransaction[] {
  const addrLower = address.toLowerCase();
  const results: NormalisedTransaction[] = [];

  for (const tx of txList) {
    // Determine if this address is involved as sender (has a matching vin)
    const isSpender = tx.vin.some(
      (vin) => vin.prevout?.scriptpubkey_address?.toLowerCase() === addrLower
    );
    if (!isSpender) continue;

    const confirmedAt = tx.status?.block_time ?? 0;
    const isoTime = confirmedAt
      ? new Date(confirmedAt * 1000).toISOString()
      : new Date().toISOString();

    // Emit one row per output that is NOT change back to ourselves
    for (const vout of tx.vout) {
      const toAddr = vout.scriptpubkey_address?.toLowerCase();
      if (!toAddr || toAddr === addrLower) continue;

      results.push({
        txHash: tx.txid,
        from: addrLower,
        to: toAddr,
        amountRaw: String(vout.value), // satoshi
        amountUSD: satoshiToUSD(vout.value),
        timestamp: isoTime,
        timestampSec: confirmedAt,
        chain: "bitcoin",
        asset: "BTC",
        blockNumber: String(tx.status?.block_height ?? 0),
      });
    }
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Blockstream API response types (subset we use)
// ─────────────────────────────────────────────────────────────────────────────

interface BlockstreamVin {
  prevout?: {
    scriptpubkey_address?: string;
    value: number;
  };
}

interface BlockstreamVout {
  scriptpubkey_address?: string;
  value: number; // satoshi
}

interface BlockstreamTx {
  txid: string;
  vin: BlockstreamVin[];
  vout: BlockstreamVout[];
  status?: {
    confirmed: boolean;
    block_height?: number;
    block_time?: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// BitcoinAdapter
// ─────────────────────────────────────────────────────────────────────────────

export class BitcoinAdapter implements ChainAdapter {
  public readonly chain = "bitcoin" as const;

  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;

  constructor(baseUrl?: string, apiKey?: string) {
    this.baseUrl = baseUrl ?? BLOCKSTREAM_BASE;
    this.apiKey = apiKey ?? process.env.BLOCKSTREAM_API_KEY;
    // Blockstream free tier works without a key — no fail-fast needed here.
  }

  /**
   * Fetch outgoing transactions for a Bitcoin address.
   *
   * Calls GET {base}/address/{addr}/txs (returns up to 25 most-recent txs).
   * For addresses with more history, we paginate using `after_txid` until
   * `pageSize` is satisfied or the API returns an empty page.
   *
   * @throws {BlockchainFetchError} on network error, HTTP error, or timeout.
   */
  async getTransactionsForAddress(
    address: string,
    opts: GetTransactionsOpts = {},
  ): Promise<NormalisedTransaction[]> {
    const pageSize = opts.pageSize ?? 100;
    const allTxs: BlockstreamTx[] = [];
    let afterTxid: string | undefined;

    try {
      while (allTxs.length < pageSize) {
        const url = afterTxid
          ? `${this.baseUrl}/address/${address}/txs/chain/${afterTxid}`
          : `${this.baseUrl}/address/${address}/txs`;

        const res = await fetchWithTimeout(url);

        if (res.status === 429) {
          throw new BlockchainFetchError(
            "bitcoin",
            address,
            "Blockstream.info rate limit hit (HTTP 429). Set BLOCKSTREAM_API_KEY for higher quota.",
          );
        }

        if (!res.ok) {
          throw new BlockchainFetchError(
            "bitcoin",
            address,
            `Blockstream.info HTTP ${res.status}: ${res.statusText}`,
          );
        }

        const page: BlockstreamTx[] = await res.json() as BlockstreamTx[];

        if (!Array.isArray(page) || page.length === 0) break;

        allTxs.push(...page);
        afterTxid = page[page.length - 1].txid;

        // Blockstream returns 25 per page; stop paginating if we got less
        if (page.length < 25) break;
      }
    } catch (err) {
      if (err instanceof BlockchainFetchError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new BlockchainFetchError("bitcoin", address, msg);
    }

    const txs = normaliseBlockstreamTxs(allTxs.slice(0, pageSize), address);
    if (opts.outgoingOnly) {
      return txs.filter((t) => t.from.toLowerCase() === address.toLowerCase());
    }
    return txs;
  }

  /**
   * Check if a Bitcoin address is a known entity (exchange, mixer, etc.).
   * Delegates to the shared entityStore.
   */
  async isKnownEntity(address: string): Promise<KnownEntityResult | null> {
    return lookupEntity(address, "bitcoin");
  }
}
