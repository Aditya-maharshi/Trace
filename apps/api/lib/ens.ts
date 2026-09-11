/**
 * lib/ens.ts
 *
 * ENS (Ethereum Name Service) reverse resolution for wallet addresses.
 * Allows the UI to display "vitalik.eth" instead of "0xd8dA...".
 *
 * - Uses the public ETH_RPC_URL env var, falling back to https://eth.llamarpc.com
 * - In-memory cache with 1-hour TTL (ENS names rarely change)
 * - Never throws — all errors return null (RPC timeouts, no reverse record, etc.)
 */

import { ethers } from "ethers";

// ──────────────────────────────────────────────────────────────────────────────
// Configuration
// ──────────────────────────────────────────────────────────────────────────────

const ETH_RPC_URL =
  process.env.ETH_RPC_URL ?? "https://eth.llamarpc.com";

/** Cache TTL: 1 hour in milliseconds. */
const ENS_CACHE_TTL_MS = 60 * 60 * 1000;

/** Max addresses to resolve concurrently without rate-limiting ourselves. */
const ENS_BATCH_CONCURRENCY_LIMIT = 20;

// ──────────────────────────────────────────────────────────────────────────────
// In-memory cache
// ──────────────────────────────────────────────────────────────────────────────

interface EnsCacheEntry {
  name: string | null;
  cachedAt: number; // Date.now() timestamp
}

/** address (lowercased) → { name, cachedAt } */
const ensCache = new Map<string, EnsCacheEntry>();

function getCached(address: string): string | null | undefined {
  const entry = ensCache.get(address.toLowerCase());
  if (!entry) return undefined; // cache miss
  if (Date.now() - entry.cachedAt > ENS_CACHE_TTL_MS) {
    ensCache.delete(address.toLowerCase());
    return undefined; // expired
  }
  return entry.name;
}

function setCache(address: string, name: string | null): void {
  ensCache.set(address.toLowerCase(), { name, cachedAt: Date.now() });
}

// ──────────────────────────────────────────────────────────────────────────────
// Provider (lazy singleton)
// ──────────────────────────────────────────────────────────────────────────────

let _provider: ethers.JsonRpcProvider | null = null;

function getProvider(): ethers.JsonRpcProvider {
  if (!_provider) {
    _provider = new ethers.JsonRpcProvider(ETH_RPC_URL);
  }
  return _provider;
}

// ──────────────────────────────────────────────────────────────────────────────
// Core functions
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Resolve an Ethereum address to its ENS name via reverse resolution.
 *
 * @param address - 0x-prefixed Ethereum address (any case).
 * @returns ENS name (e.g. "vitalik.eth") or null if none / error.
 */
export async function resolveENS(address: string): Promise<string | null> {
  const lower = address.toLowerCase();

  // Check cache first
  const cached = getCached(lower);
  if (cached !== undefined) return cached;

  try {
    const provider = getProvider();
    const name = await provider.lookupAddress(address);
    setCache(lower, name ?? null);
    return name ?? null;
  } catch {
    // RPC timeout, no reverse record, network error — all treated as null
    setCache(lower, null);
    return null;
  }
}

/**
 * Resolve multiple addresses to ENS names in parallel.
 * Uses a concurrency limiter if > ENS_BATCH_CONCURRENCY_LIMIT addresses.
 *
 * @param addresses - Array of 0x-prefixed Ethereum addresses.
 * @returns Map from lowercased address to ENS name (or null if not found).
 */
export async function resolveENSBatch(
  addresses: string[],
): Promise<Map<string, string | null>> {
  if (addresses.length === 0) return new Map();

  const unique = [...new Set(addresses.map((a) => a.toLowerCase()))];

  if (unique.length <= ENS_BATCH_CONCURRENCY_LIMIT) {
    // Simple parallel resolution — no rate-limiting needed
    const results = await Promise.all(
      unique.map(async (addr) => ({ addr, name: await resolveENS(addr) })),
    );
    return new Map(results.map(({ addr, name }) => [addr, name]));
  }

  // Chunked resolution for large batches
  const resultMap = new Map<string, string | null>();
  for (let i = 0; i < unique.length; i += ENS_BATCH_CONCURRENCY_LIMIT) {
    const chunk = unique.slice(i, i + ENS_BATCH_CONCURRENCY_LIMIT);
    const chunkResults = await Promise.all(
      chunk.map(async (addr) => ({ addr, name: await resolveENS(addr) })),
    );
    for (const { addr, name } of chunkResults) {
      resultMap.set(addr, name);
    }
  }
  return resultMap;
}
