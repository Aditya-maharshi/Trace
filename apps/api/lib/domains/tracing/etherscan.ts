/**
 * lib/etherscan.ts
 *
 * Resilient blockchain transaction data client for Ethereum mainnet.
 * Features:
 *   1. Multi-tier TTL caching (in-memory Map + on-disk cache in data/cache/)
 *   2. Dual-provider architecture (Primary: Etherscan, Fallback: Blockscout)
 *   3. Rate limiting and concurrency throttling
 *   4. Clean provider interface with dependency injection for unit testing
 */

import { promises as fs } from "fs";
import path from "path";
import { getRedisClient } from "../core/redis";
import { buildBridgeSet, isBridge, labelForBridge } from "./bridgeLabels";
import { logApiTrace, requestContextStorage } from "../core/logger";

// ──────────────────────────────────────────────────────────────────────────────
// Interfaces & Types
// ──────────────────────────────────────────────────────────────────────────────

export interface Transaction {
  hash: string;
  from: string;
  to: string;
  /** Value in wei (string to avoid JS number precision loss). */
  value: string;
  blockNumber: string;
  timeStamp: string;
}

export interface TokenTransaction {
  hash: string;
  from: string;
  to: string;
  /** Value in raw token units (string to avoid JS number precision loss). */
  value: string;
  tokenSymbol: string;
  tokenDecimal: string;
  contractAddress: string;
  timeStamp: string;
  blockNumber: string;
}

export interface DataProvenance {
  source: "live-etherscan" | "live-blockscout" | "fixture-cache";
  fetchedAt: string;
}

export interface FetchResult<T> {
  data: T[];
  provenance: DataProvenance;
  /** True when the provider indicated more history exists beyond this page. */
  truncated: boolean;
}

export interface BlockchainDataProvider {
  name: string;
  getTransactions(address: string, pageSize?: number): Promise<Transaction[]>;
  getTokenTransactions(address: string, pageSize?: number): Promise<TokenTransaction[]>;
}

/** Default Etherscan V2 unified endpoint (V1 ` /api ` is deprecated). */
export const ETHERSCAN_V2_BASE_URL = "https://api.etherscan.io/v2/api";

/**
 * Map leftover V1 URLs onto V2 so existing ETHERSCAN_BASE_URL env values keep working.
 */
export function resolveEtherscanBaseUrl(raw?: string): string {
  const fallback = ETHERSCAN_V2_BASE_URL;
  if (!raw) return fallback;
  const trimmed = raw.replace(/\/+$/, "");
  if (trimmed === "https://api.etherscan.io/api" || trimmed === "http://api.etherscan.io/api") {
    return ETHERSCAN_V2_BASE_URL;
  }
  return raw;
}

// ──────────────────────────────────────────────────────────────────────────────
// Concurrency Limiter
// ──────────────────────────────────────────────────────────────────────────────

class ConcurrencyLimiter {
  private running = 0;
  private readonly waitQueue: Array<() => void> = [];

  constructor(private readonly maxConcurrent: number) {}

  async acquire(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      this.running++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.waitQueue.push(() => {
        this.running++;
        resolve();
      });
    });
  }

  release(): void {
    this.running--;
    const next = this.waitQueue.shift();
    if (next) {
      next();
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Cache Layer (In-Memory + On-Disk)
// ──────────────────────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  cachedAt: number;
  expiresAt: number;
}

/** 5 minutes TTL in milliseconds */
export const CACHE_TTL_MS = 5 * 60 * 1000;

const memoryCache = new Map<string, CacheEntry<unknown>>();

function getCacheDir(): string {
  return path.join(process.cwd(), "fixtures");
}

function getCacheFilePath(key: string): string {
  // Sanitize key for filesystem
  const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(getCacheDir(), `${safeKey}.json`);
}

/**
 * Read item from persistent Redis cache, falling back to in-memory and disk cache.
 */
export async function readCache<T>(key: string): Promise<{ data: T; cachedAt: number } | null> {
  const now = Date.now();

  // 1. Check persistent Upstash Redis cache if available
  const redis = getRedisClient();
  if (redis) {
    try {
      const redisKey = `cache:${key}`;
      const cached = await redis.get<CacheEntry<T> | T>(redisKey);
      if (cached) {
        if (
          typeof cached === "object" &&
          cached !== null &&
          "data" in cached &&
          "expiresAt" in cached
        ) {
          const entry = cached as CacheEntry<T>;
          if (entry.expiresAt > now) {
            memoryCache.set(key, entry);
            return { data: entry.data, cachedAt: entry.cachedAt };
          }
        } else {
          return { data: cached as T, cachedAt: now };
        }
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[dataProvider] Persistent Redis cache read failed for ${key} (${errorMsg}). Falling back to local cache.`,
      );
    }
  }

  // 2. Check in-memory cache
  const mem = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (mem) {
    if (mem.expiresAt > now) {
      return { data: mem.data, cachedAt: mem.cachedAt };
    }
    memoryCache.delete(key);
  }

  // 3. Check disk cache
  const filePath = getCacheFilePath(key);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const entry = JSON.parse(raw) as CacheEntry<T>;
      if (entry && entry.expiresAt > now) {
      memoryCache.set(key, entry);
      const ctx = requestContextStorage.getStore();
      if (ctx) ctx.dataSource = "cached-fixture";
      return { data: entry.data, cachedAt: entry.cachedAt };
    }
    // Expired
    await fs.unlink(filePath).catch(() => {});
  } catch {
    // File doesn't exist or cannot be parsed
  }

  return null;
}

/**
 * Write item to persistent Redis cache, in-memory cache, and on-disk cache.
 */
export async function writeCache<T>(key: string, data: T, ttlMs = CACHE_TTL_MS): Promise<void> {
  const now = Date.now();
  const entry: CacheEntry<T> = {
    data,
    cachedAt: now,
    expiresAt: now + ttlMs,
  };

  // 1. Write to in-memory cache
  memoryCache.set(key, entry);

  // 2. Write to persistent Redis cache if available
  const redis = getRedisClient();
  if (redis) {
    try {
      const redisKey = `cache:${key}`;
      await redis.set(redisKey, entry, { px: ttlMs });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[dataProvider] Persistent Redis cache write failed for ${key} (${errorMsg}).`,
      );
    }
  }

  // 3. Write to local disk cache
  try {
    const dir = getCacheDir();
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(getCacheFilePath(key), JSON.stringify(entry), "utf-8");
  } catch (err) {
    console.warn(`[dataProvider] Failed to write disk cache file for ${key}:`, err);
  }
}

/**
 * Clear the transaction cache (in-memory, disk, and Redis).
 */
export async function clearTransactionCache(): Promise<void> {
  memoryCache.clear();

  // Clear persistent Redis cache
  const redis = getRedisClient();
  if (redis) {
    try {
      const keys = await redis.keys("cache:tx_*");
      const tokenKeys = await redis.keys("cache:tokentx_*");
      const allKeys = [...keys, ...tokenKeys];
      if (allKeys.length > 0) {
        await redis.del(...allKeys);
      }
    } catch (err) {
      console.warn("[dataProvider] Failed to clear Redis cache keys:", err);
    }
  }

  // Clear disk cache
  try {
    const dir = getCacheDir();
    const files = await fs.readdir(dir);
    for (const file of files) {
      if (file.startsWith("tx_") || file.startsWith("tokentx_")) {
        await fs.unlink(path.join(dir, file)).catch(() => {});
      }
    }
  } catch {
    // directory may not exist
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Provider Implementations
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Helper to query Etherscan-compatible REST endpoints (Etherscan & Blockscout).
 */
async function fetchAccountEndpoint<T>(
  baseUrl: string,
  apiKey: string,
  limiter: ConcurrencyLimiter,
  providerName: string,
  params: Record<string, string>,
): Promise<T[]> {
  await limiter.acquire();
  try {
    const url = new URL(baseUrl);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
    if (apiKey) {
      url.searchParams.set("apikey", apiKey);
    }
    if (url.pathname.includes("/v2/api") && !url.searchParams.has("chainid")) {
      url.searchParams.set("chainid", process.env.ETHERSCAN_CHAIN_ID || "1");
    }

    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const startMs = Date.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      let res: Response;
      try {
        res = await fetch(url.toString(), { signal: controller.signal });
      } finally {
        clearTimeout(timeoutId);
      }
      const latencyMs = Date.now() - startMs;
      logApiTrace(providerName, latencyMs, res.status, { endpoint: baseUrl });

      if (res.status === 429 && attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        continue;
      }
      if (!res.ok) {
        throw new Error(`${providerName} HTTP ${res.status}: ${res.statusText}`);
      }

      const json = (await res.json()) as {
        status?: string;
        message?: string;
        result?: T[] | string;
      };

      if (typeof json.result === "string") {
        const lower = json.result.toLowerCase();
        if (lower.includes("deprecated") && lower.includes("v1")) {
          throw new Error(`${providerName} error: deprecated V1 endpoint (${json.result})`);
        }
        if ((lower.includes("rate limit") || lower.includes("max rate")) && attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
          continue;
        }
        if (lower.includes("rate limit") || lower.includes("max rate")) {
          throw new Error(`${providerName} rate limit: ${json.result}`);
        }
      }

      if (json.status === "0") {
        const msg =
          (typeof json.result === "string" && json.result.trim() ? json.result : json.message) ||
          "No details provided";
        const lower = msg.toLowerCase();
        if (lower.includes("no transactions found") || lower.includes("no records found")) {
          return [];
        }
        throw new Error(`${providerName} error: ${msg}`);
      }

      if (typeof json.result === "string") {
        return [];
      }

      if (json.status !== "1" || !Array.isArray(json.result)) {
        return [];
      }

      return json.result;
    }

    return [];
  } finally {
    limiter.release();
  }
}

export class EtherscanProvider implements BlockchainDataProvider {
  public readonly name = "Etherscan";
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly limiter = new ConcurrencyLimiter(4);

  constructor(baseUrl?: string, apiKey?: string) {
    this.baseUrl = resolveEtherscanBaseUrl(baseUrl ?? process.env.ETHERSCAN_BASE_URL);
    this.apiKey = apiKey ?? process.env.ETHERSCAN_API_KEY ?? "";
  }

  async getTransactions(address: string, pageSize = 100): Promise<Transaction[]> {
    // Fetch one extra row so callers can tell a hot wallet's history was truncated.
    const rows = await fetchAccountEndpoint<Transaction>(
      this.baseUrl,
      this.apiKey,
      this.limiter,
      this.name,
      {
        module: "account",
        action: "txlist",
        address,
        startblock: "0",
        endblock: "99999999",
        page: "1",
        offset: String(pageSize + 1),
        sort: "desc",
      },
    );
    return Object.assign(rows.slice(0, pageSize), { truncated: rows.length > pageSize });
  }

  async getTokenTransactions(address: string, pageSize = 100): Promise<TokenTransaction[]> {
    const rows = await fetchAccountEndpoint<TokenTransaction>(
      this.baseUrl,
      this.apiKey,
      this.limiter,
      this.name,
      {
        module: "account",
        action: "tokentx",
        address,
        startblock: "0",
        endblock: "99999999",
        page: "1",
        offset: String(pageSize + 1),
        sort: "desc",
      },
    );
    return Object.assign(rows.slice(0, pageSize), { truncated: rows.length > pageSize });
  }
}

export class BlockscoutProvider implements BlockchainDataProvider {
  public readonly name = "Blockscout";
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly limiter = new ConcurrencyLimiter(3);

  constructor(baseUrl?: string, apiKey?: string) {
    this.baseUrl = baseUrl ?? process.env.BLOCKSCOUT_BASE_URL ?? "https://eth.blockscout.com";
    this.apiKey = apiKey ?? process.env.BLOCKSCOUT_API_KEY ?? "";
  }

  async getTransactions(address: string, pageSize = 100): Promise<Transaction[]> {
    // If standard eth.blockscout.com domain, prefer high-throughput v2 REST API
    if (this.baseUrl.includes("eth.blockscout.com")) {
      try {
        await this.limiter.acquire();
        const url = `https://eth.blockscout.com/api/v2/addresses/${address}/transactions`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        let res: Response;
        try {
          res = await fetch(url, { signal: controller.signal });
        } finally {
          clearTimeout(timeoutId);
        }
        if (res.ok) {
          const data = (await res.json()) as {
            items?: Array<Record<string, unknown>>;
            next_page_params?: unknown;
          };
          if (Array.isArray(data.items)) {
            const mapped = data.items.slice(0, pageSize).map((it: any) => ({
              hash: String(it.hash || ""),
              from: String(it.from?.hash || "").toLowerCase(),
              to: String(it.to?.hash || "").toLowerCase(),
              value: String(it.value ?? "0"),
              timeStamp: it.timestamp
                ? String(Math.floor(new Date(String(it.timestamp)).getTime() / 1000))
                : "0",
              blockNumber: String(it.block_number ?? "0"),
            }));
            const truncated = Boolean(data.next_page_params) || data.items.length > pageSize;
            return Object.assign(mapped, { truncated });
          }
        }
      } catch {
        // Fall back to RPC-style endpoint
      } finally {
        this.limiter.release();
      }
    }

    const rpcBase = this.baseUrl.endsWith("/api") ? this.baseUrl : `${this.baseUrl}/api`;
    const rows = await fetchAccountEndpoint<Transaction>(
      rpcBase,
      this.apiKey,
      this.limiter,
      this.name,
      {
        module: "account",
        action: "txlist",
        address,
        startblock: "0",
        endblock: "99999999",
        page: "1",
        offset: String(pageSize + 1),
        sort: "desc",
      },
    );
    return Object.assign(rows.slice(0, pageSize), { truncated: rows.length > pageSize });
  }

  async getTokenTransactions(address: string, pageSize = 100): Promise<TokenTransaction[]> {
    // If standard eth.blockscout.com domain, prefer high-throughput v2 REST API
    if (this.baseUrl.includes("eth.blockscout.com")) {
      try {
        await this.limiter.acquire();
        const url = `https://eth.blockscout.com/api/v2/addresses/${address}/token-transfers`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        let res: Response;
        try {
          res = await fetch(url, { signal: controller.signal });
        } finally {
          clearTimeout(timeoutId);
        }
        if (res.ok) {
          const data = (await res.json()) as {
            items?: Array<Record<string, unknown>>;
            next_page_params?: unknown;
          };
          if (Array.isArray(data.items)) {
            const mapped = data.items.slice(0, pageSize).map((it: any) => ({
              hash: String(it.transaction_hash || ""),
              from: String(it.from?.hash || "").toLowerCase(),
              to: String(it.to?.hash || "").toLowerCase(),
              value: String(it.total?.value ?? "0"),
              tokenSymbol: String(it.token?.symbol || ""),
              tokenDecimal: String(it.total?.decimals ?? it.token?.decimals ?? "18"),
              contractAddress: String(it.token?.address_hash || "").toLowerCase(),
              timeStamp: it.timestamp
                ? String(Math.floor(new Date(String(it.timestamp)).getTime() / 1000))
                : "0",
              blockNumber: String(it.block_number ?? "0"),
            }));
            const truncated = Boolean(data.next_page_params) || data.items.length > pageSize;
            return Object.assign(mapped, { truncated });
          }
        }
      } catch {
        // Fall back to RPC-style endpoint
      } finally {
        this.limiter.release();
      }
    }

    const rpcBase = this.baseUrl.endsWith("/api") ? this.baseUrl : `${this.baseUrl}/api`;
    const rows = await fetchAccountEndpoint<TokenTransaction>(
      rpcBase,
      this.apiKey,
      this.limiter,
      this.name,
      {
        module: "account",
        action: "tokentx",
        address,
        startblock: "0",
        endblock: "99999999",
        page: "1",
        offset: String(pageSize + 1),
        sort: "desc",
      },
    );
    return Object.assign(rows.slice(0, pageSize), { truncated: rows.length > pageSize });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Default Providers & Dynamic Injection
// ──────────────────────────────────────────────────────────────────────────────

let primaryProvider: BlockchainDataProvider = new EtherscanProvider();
let fallbackProvider: BlockchainDataProvider = new BlockscoutProvider();

export function setProviders(
  primary: BlockchainDataProvider,
  fallback: BlockchainDataProvider,
): void {
  primaryProvider = primary;
  fallbackProvider = fallback;
}

export function resetProviders(): void {
  primaryProvider = new EtherscanProvider();
  fallbackProvider = new BlockscoutProvider();
}

// ──────────────────────────────────────────────────────────────────────────────
// Resilient Dispatch with Cache & Fallback
// ──────────────────────────────────────────────────────────────────────────────

function pageFromProviderResult<T>(result: T[], pageSize: number): { items: T[]; truncated: boolean } {
  const flagged = Boolean((result as T[] & { truncated?: boolean }).truncated);
  return {
    items: Array.isArray(result) ? Array.from(result) : [],
    truncated: flagged || result.length > pageSize,
  };
}

async function executeWithFallback<T>(
  cacheKey: string,
  fetcher: (provider: BlockchainDataProvider) => Promise<T[]>,
  address: string,
  pageSize: number,
): Promise<FetchResult<T>> {
  const isDemoMode = process.env.DEMO_MODE === "true";

  // 1. Check cache first
  const cached = await readCache<{ items: T[]; truncated?: boolean } | T[]>(cacheKey);
  if (cached) {
    const page = Array.isArray(cached.data)
      ? { items: cached.data, truncated: cached.data.length >= pageSize }
      : { items: cached.data.items ?? [], truncated: Boolean(cached.data.truncated) };
    return {
      data: page.items,
      provenance: {
        source: "fixture-cache",
        fetchedAt: new Date(cached.cachedAt).toISOString(),
      },
      truncated: page.truncated,
    };
  }

  if (isDemoMode) {
    throw new Error(`DEMO_MODE is true, but no fixture found for ${address} (${cacheKey})`);
  }

  // 2. Query primary provider
  let primaryError: Error | null = null;
  try {
    const ctx = requestContextStorage.getStore();
    if (ctx) ctx.dataSource = "live";

    const result = await fetcher(primaryProvider);
    const page = pageFromProviderResult(result, pageSize);
    await writeCache(cacheKey, page);
    return {
      data: page.items,
      provenance: {
        source: primaryProvider.name.toLowerCase().includes("blockscout") ? "live-blockscout" : "live-etherscan",
        fetchedAt: new Date().toISOString(),
      },
      truncated: page.truncated,
    };
  } catch (err: unknown) {
    primaryError = err instanceof Error ? err : new Error(String(err));
    console.warn(
      `[dataProvider] Primary provider (${primaryProvider.name}) failed for ${address}: ${primaryError.message}. Falling back to ${fallbackProvider.name}...`,
    );
  }

  // 3. Query fallback provider
  try {
    const fallbackResult = await fetcher(fallbackProvider);
    const page = pageFromProviderResult(fallbackResult, pageSize);
    console.warn(
      `[dataProvider] Fallback provider (${fallbackProvider.name}) succeeded for ${address} (${page.items.length} items).`,
    );
    await writeCache(cacheKey, page);
    return {
      data: page.items,
      provenance: {
        source: fallbackProvider.name.toLowerCase().includes("etherscan") ? "live-etherscan" : "live-blockscout",
        fetchedAt: new Date().toISOString(),
      },
      truncated: page.truncated,
    };
  } catch (fallbackErr: unknown) {
    const secError = fallbackErr instanceof Error ? fallbackErr : new Error(String(fallbackErr));
    console.warn(
      `[dataProvider] Fallback provider (${fallbackProvider.name}) also failed for ${address}: ${secError.message}.`,
    );
    throw new Error(
      `All blockchain data providers failed for ${address}. Primary (${primaryProvider.name}): ${primaryError?.message}; Fallback (${fallbackProvider.name}): ${secError.message}`,
    );
  }
}

/**
 * Fetch the normal (external) transaction list for `address`.
 * Returns up to `pageSize` most-recent transactions sorted newest-first.
 * Automatically checks cache and falls back to secondary provider on error.
 */
export async function getTransactions(
  address: string,
  pageSize = 100,
): Promise<FetchResult<Transaction>> {
  const cacheKey = `tx_${address.toLowerCase()}_${pageSize}`;
  return executeWithFallback<Transaction>(
    cacheKey,
    (provider) => provider.getTransactions(address, pageSize),
    address,
    pageSize,
  );
}

/**
 * Fetch ERC-20 token transfer events for `address`.
 * Returns up to `pageSize` most-recent token transfers sorted newest-first.
 * Automatically checks cache and falls back to secondary provider on error.
 */
export async function getTokenTransactions(
  address: string,
  pageSize = 100,
): Promise<FetchResult<TokenTransaction>> {
  const cacheKey = `tokentx_${address.toLowerCase()}_${pageSize}`;
  return executeWithFallback<TokenTransaction>(
    cacheKey,
    (provider) => provider.getTokenTransactions(address, pageSize),
    address,
    pageSize,
  );
}
