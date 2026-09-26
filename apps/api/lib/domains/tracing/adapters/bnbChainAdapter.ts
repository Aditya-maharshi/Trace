/**
 * lib/domains/tracing/adapters/bnbChainAdapter.ts
 *
 * BNB Chain (BSC) ChainAdapter using the BscScan API.
 *
 * ### Data source
 * BscScan API: https://api.bscscan.com/api (same interface as Etherscan)
 * Env var: BSCSCAN_API_KEY
 *
 * ### Note on address format
 * BNB Chain is EVM-compatible — addresses are the same 0x Ethereum format.
 * The same VASP labels can overlap (e.g. Binance BSC hot wallets have the
 * same address as their Ethereum counterparts). entityStore handles this by
 * multi-chain lookup.
 *
 * ### Rate limits
 * Free tier: 5 requests/second, max 10,000/day.
 * With API key: 20 requests/second.
 * Missing key is a warning, not an error — free tier works (slowly).
 *
 * @throws {BlockchainFetchError} on HTTP error, timeout, or parse failure.
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

const BSCSCAN_BASE = "https://api.bscscan.com/api";
const FETCH_TIMEOUT_MS = 10_000;
/** Approximate BNB → USD rate. Replace with live price post-MVP. */
const BNB_TO_USD = 580;
const WEI_PER_BNB = 1_000_000_000_000_000_000n;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function fetchTimeout(url: string): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function weiBnbToUSD(weiStr: string): number {
  const wei = BigInt(weiStr || "0");
  const microBnb = Number((wei * 1_000_000n) / WEI_PER_BNB) / 1_000_000;
  return microBnb * BNB_TO_USD;
}

function tokenToUSD(valueStr: string, decimals: string | number, symbol: string): number {
  const TOKEN_PRICES: Record<string, number> = { USDT: 1, USDC: 1, BUSD: 1, BNB: BNB_TO_USD };
  const price = TOKEN_PRICES[symbol?.toUpperCase()] ?? 1;
  const dec = Number(decimals || 18);
  const raw = BigInt(valueStr || "0");
  const divisor = 10n ** BigInt(dec);
  const whole = Number(raw / divisor);
  const frac = Number(raw % divisor) / Number(divisor);
  return (whole + frac) * price;
}

// ─────────────────────────────────────────────────────────────────────────────
// BscScan response types (same schema as Etherscan)
// ─────────────────────────────────────────────────────────────────────────────

interface BscTx {
  hash: string;
  from: string;
  to: string;
  value: string;
  timeStamp: string;
  blockNumber: string;
  isError?: string;
}

interface BscTokenTx {
  hash: string;
  from: string;
  to: string;
  value: string;
  timeStamp: string;
  blockNumber: string;
  tokenSymbol: string;
  tokenDecimal: string;
  contractAddress: string;
}

interface BscApiResponse<T> {
  status: string;
  message: string;
  result: T[] | string;
}

// ─────────────────────────────────────────────────────────────────────────────
// BnbChainAdapter
// ─────────────────────────────────────────────────────────────────────────────

export class BnbChainAdapter implements ChainAdapter {
  public readonly chain = "bnbchain" as const;

  private readonly apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env.BSCSCAN_API_KEY ?? "";
    if (!this.apiKey) {
      console.warn("[BnbChainAdapter] BSCSCAN_API_KEY not set — using free tier (may rate-limit)");
    }
  }

  private buildUrl(params: Record<string, string>): string {
    const p = new URLSearchParams({
      ...params,
      apikey: this.apiKey || "YourApiKeyToken",
    });
    return `${BSCSCAN_BASE}?${p.toString()}`;
  }

  async getTransactionsForAddress(
    address: string,
    opts: GetTransactionsOpts = {},
  ): Promise<NormalisedTransaction[]> {
    const limit = Math.min(opts.pageSize ?? 100, 10000);
    const results: NormalisedTransaction[] = [];

    // ── Native BNB transactions ─────────────────────────────────────────────
    try {
      const url = this.buildUrl({
        module: "account",
        action: "txlist",
        address,
        startblock: "0",
        endblock: "99999999",
        page: "1",
        offset: String(limit),
        sort: "desc",
      });
      const res = await fetchTimeout(url);
      if (res.status === 429) throw new BlockchainFetchError("bnbchain", address, "BscScan rate limit (HTTP 429). Set BSCSCAN_API_KEY.");
      if (!res.ok) throw new BlockchainFetchError("bnbchain", address, `BscScan HTTP ${res.status}`);

      const body = await res.json() as BscApiResponse<BscTx>;
      if (body.status === "1" && Array.isArray(body.result)) {
        for (const tx of body.result as BscTx[]) {
          if (tx.isError === "1") continue;
          const addrLower = address.toLowerCase();
          if (opts.outgoingOnly && tx.from.toLowerCase() !== addrLower) continue;
          results.push({
            txHash: tx.hash,
            from: tx.from.toLowerCase(),
            to: tx.to.toLowerCase(),
            amountRaw: tx.value,
            amountUSD: weiBnbToUSD(tx.value),
            timestamp: new Date(parseInt(tx.timeStamp, 10) * 1000).toISOString(),
            timestampSec: parseInt(tx.timeStamp, 10),
            chain: "bnbchain",
            asset: "BNB",
            blockNumber: tx.blockNumber,
          });
        }
      }
    } catch (err) {
      if (err instanceof BlockchainFetchError) throw err;
      throw new BlockchainFetchError("bnbchain", address, err instanceof Error ? err.message : String(err));
    }

    // ── BEP-20 token transactions ──────────────────────────────────────────
    try {
      const url = this.buildUrl({
        module: "account",
        action: "tokentx",
        address,
        startblock: "0",
        endblock: "99999999",
        page: "1",
        offset: String(Math.min(limit, 200)),
        sort: "desc",
      });
      const res = await fetchTimeout(url);
      if (res.ok) {
        const body = await res.json() as BscApiResponse<BscTokenTx>;
        if (body.status === "1" && Array.isArray(body.result)) {
          for (const tx of body.result as BscTokenTx[]) {
            const addrLower = address.toLowerCase();
            if (opts.outgoingOnly && tx.from.toLowerCase() !== addrLower) continue;
            results.push({
              txHash: tx.hash,
              from: tx.from.toLowerCase(),
              to: tx.to.toLowerCase(),
              amountRaw: tx.value,
              amountUSD: tokenToUSD(tx.value, tx.tokenDecimal, tx.tokenSymbol),
              timestamp: new Date(parseInt(tx.timeStamp, 10) * 1000).toISOString(),
              timestampSec: parseInt(tx.timeStamp, 10),
              chain: "bnbchain",
              asset: tx.tokenSymbol || "BEP20",
              blockNumber: tx.blockNumber,
            });
          }
        }
      }
    } catch {
      console.warn(`[BnbChainAdapter] BEP-20 fetch failed for ${address} — native BNB results only`);
    }

    return results;
  }

  async isKnownEntity(address: string): Promise<KnownEntityResult | null> {
    return lookupEntity(address, "bnbchain");
  }
}
