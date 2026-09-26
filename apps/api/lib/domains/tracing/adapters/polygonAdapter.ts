/**
 * lib/domains/tracing/adapters/polygonAdapter.ts
 *
 * Polygon (PoS) ChainAdapter using the Polygonscan API.
 *
 * Polygon PoS is EVM-compatible, so this adapter is structurally identical
 * to BnbChainAdapter but points to Polygonscan's endpoint with MATIC pricing.
 *
 * ### Data source
 * Polygonscan API: https://api.polygonscan.com/api
 * Env var: POLYGONSCAN_API_KEY
 *
 * ### Rate limits (free tier)
 * 5 requests/second, max 100,000/day.
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

const POLYGONSCAN_BASE = "https://api.polygonscan.com/api";
const FETCH_TIMEOUT_MS = 10_000;
/** Approximate MATIC → USD rate. Replace with live price post-MVP. */
const MATIC_TO_USD = 0.55;
const WEI_PER_MATIC = 1_000_000_000_000_000_000n;

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

function weiMaticToUSD(weiStr: string): number {
  const wei = BigInt(weiStr || "0");
  const microMatic = Number((wei * 1_000_000n) / WEI_PER_MATIC) / 1_000_000;
  return microMatic * MATIC_TO_USD;
}

function tokenToUSD(valueStr: string, decimals: string | number, symbol: string): number {
  const TOKEN_PRICES: Record<string, number> = { USDT: 1, USDC: 1, DAI: 1, MATIC: MATIC_TO_USD };
  const price = TOKEN_PRICES[symbol?.toUpperCase()] ?? 1;
  const dec = Number(decimals || 18);
  const raw = BigInt(valueStr || "0");
  const divisor = 10n ** BigInt(dec);
  return (Number(raw / divisor) + Number(raw % divisor) / Number(divisor)) * price;
}

// ─────────────────────────────────────────────────────────────────────────────
// Polygonscan API types (Etherscan-compatible schema)
// ─────────────────────────────────────────────────────────────────────────────

interface PolygonTx {
  hash: string;
  from: string;
  to: string;
  value: string;
  timeStamp: string;
  blockNumber: string;
  isError?: string;
}

interface PolygonTokenTx {
  hash: string;
  from: string;
  to: string;
  value: string;
  timeStamp: string;
  blockNumber: string;
  tokenSymbol: string;
  tokenDecimal: string;
}

interface PolygonscanResponse<T> {
  status: string;
  result: T[] | string;
}

// ─────────────────────────────────────────────────────────────────────────────
// PolygonAdapter
// ─────────────────────────────────────────────────────────────────────────────

export class PolygonAdapter implements ChainAdapter {
  public readonly chain = "polygon" as const;

  private readonly apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env.POLYGONSCAN_API_KEY ?? "";
    if (!this.apiKey) {
      console.warn("[PolygonAdapter] POLYGONSCAN_API_KEY not set — using free tier (may rate-limit)");
    }
  }

  private buildUrl(params: Record<string, string>): string {
    const p = new URLSearchParams({
      ...params,
      apikey: this.apiKey || "YourApiKeyToken",
    });
    return `${POLYGONSCAN_BASE}?${p.toString()}`;
  }

  async getTransactionsForAddress(
    address: string,
    opts: GetTransactionsOpts = {},
  ): Promise<NormalisedTransaction[]> {
    const limit = Math.min(opts.pageSize ?? 100, 10000);
    const results: NormalisedTransaction[] = [];

    // ── Native MATIC transactions ─────────────────────────────────────────
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
      if (res.status === 429) throw new BlockchainFetchError("polygon", address, "Polygonscan rate limit (HTTP 429). Set POLYGONSCAN_API_KEY.");
      if (!res.ok) throw new BlockchainFetchError("polygon", address, `Polygonscan HTTP ${res.status}`);

      const body = await res.json() as PolygonscanResponse<PolygonTx>;
      if (body.status === "1" && Array.isArray(body.result)) {
        const addrLower = address.toLowerCase();
        for (const tx of body.result as PolygonTx[]) {
          if (tx.isError === "1") continue;
          if (opts.outgoingOnly && tx.from.toLowerCase() !== addrLower) continue;
          results.push({
            txHash: tx.hash,
            from: tx.from.toLowerCase(),
            to: tx.to.toLowerCase(),
            amountRaw: tx.value,
            amountUSD: weiMaticToUSD(tx.value),
            timestamp: new Date(parseInt(tx.timeStamp, 10) * 1000).toISOString(),
            timestampSec: parseInt(tx.timeStamp, 10),
            chain: "polygon",
            asset: "MATIC",
            blockNumber: tx.blockNumber,
          });
        }
      }
    } catch (err) {
      if (err instanceof BlockchainFetchError) throw err;
      throw new BlockchainFetchError("polygon", address, err instanceof Error ? err.message : String(err));
    }

    // ── ERC-20 token transactions (on Polygon PoS) ────────────────────────
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
        const body = await res.json() as PolygonscanResponse<PolygonTokenTx>;
        if (body.status === "1" && Array.isArray(body.result)) {
          const addrLower = address.toLowerCase();
          for (const tx of body.result as PolygonTokenTx[]) {
            if (opts.outgoingOnly && tx.from.toLowerCase() !== addrLower) continue;
            results.push({
              txHash: tx.hash,
              from: tx.from.toLowerCase(),
              to: tx.to.toLowerCase(),
              amountRaw: tx.value,
              amountUSD: tokenToUSD(tx.value, tx.tokenDecimal, tx.tokenSymbol),
              timestamp: new Date(parseInt(tx.timeStamp, 10) * 1000).toISOString(),
              timestampSec: parseInt(tx.timeStamp, 10),
              chain: "polygon",
              asset: tx.tokenSymbol || "ERC20",
              blockNumber: tx.blockNumber,
            });
          }
        }
      }
    } catch {
      console.warn(`[PolygonAdapter] ERC-20 fetch failed for ${address} — native MATIC results only`);
    }

    return results;
  }

  async isKnownEntity(address: string): Promise<KnownEntityResult | null> {
    return lookupEntity(address, "polygon");
  }
}
