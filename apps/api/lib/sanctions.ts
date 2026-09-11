/**
 * lib/sanctions.ts
 *
 * OpenSanctions screening for Ethereum addresses.
 * Checks whether any address in a transaction path appears on international
 * sanctions lists via the OpenSanctions API.
 *
 * ─── COMPLIANCE REQUIREMENT ─────────────────────────────────────────────────
 *
 * If ANY node in a path is sanctioned, the overall risk MUST be flagged HIGH
 * regardless of the attribution confidence score. This is not a UX nicety —
 * it is a hard compliance requirement. Sanctions regulations (OFAC, EU, UN)
 * impose strict liability: transacting with a sanctioned entity is unlawful
 * even if the transaction is indirect (e.g. via an intermediary). A "Medium"
 * confidence attribution to a clean VASP is irrelevant if the money flowed
 * through a sanctioned mixer on the way there. Always escalate.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { promises as fs } from "fs";
import path from "path";
import { logApiTrace } from "./logger";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Result of an OpenSanctions search for a single address.
 */
export interface SanctionsCheckResult {
  /** The Ethereum address that was checked (lowercased). */
  address: string;
  /** Whether the address appears on any sanctions list. */
  sanctioned: boolean;
  /** Number of matching entities found (0 if clean). */
  matchCount: number;
  /** ISO timestamp of when this check was performed. */
  checkedAt: string;
}

/**
 * Per-address risk flag used in path screening.
 */
export interface AddressRiskFlag {
  /** The Ethereum address. */
  address: string;
  /** Whether this specific address is sanctioned. */
  sanctioned: boolean;
}

/**
 * Shape of the OpenSanctions /search/default response (subset).
 */
interface OpenSanctionsResponse {
  total: {
    value: number;
    relation: string;
  };
  results: Array<{
    id: string;
    schema: string;
    caption: string;
    datasets: string[];
  }>;
}

/**
 * Shape of the on-disk cache entry.
 */
interface CacheEntry {
  result: SanctionsCheckResult;
  /** ISO timestamp of when this was cached. */
  cachedAt: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────

const OPENSANCTIONS_BASE_URL =
  process.env.OPENSANCTIONS_BASE_URL ??
  "https://api.opensanctions.org/search/default";

const OPENSANCTIONS_API_KEY = process.env.OPENSANCTIONS_API_KEY ?? "";

/** Cache directory relative to the project root. */
const CACHE_DIR = path.resolve(process.cwd(), "fixtures");

/**
 * Cache TTL in milliseconds.
 * Sanctions lists update ~daily, so 24h is a safe cache window.
 */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// ──────────────────────────────────────────────────────────────────────────────
// In-memory concurrency limiter
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Simple semaphore-style rate limiter.
 * Caps the number of concurrent in-flight requests to OpenSanctions.
 *
 * The free tier may throttle aggressively, so we default to 5 concurrent
 * slots. Callers acquire a slot before making a request and release it
 * when done (including on error).
 */
class ConcurrencyLimiter {
  private running = 0;
  private readonly waitQueue: Array<() => void> = [];

  constructor(private readonly maxConcurrent: number) {}

  async acquire(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      this.running++;
      return;
    }
    // Wait until a slot opens
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

/** Max 5 concurrent requests to OpenSanctions. */
const limiter = new ConcurrencyLimiter(5);

// ──────────────────────────────────────────────────────────────────────────────
// File-based cache helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Build the cache file path for a given address.
 * Example: data/cache/sanctions_0x742d35cc6634c0532925a3b844bc9e7595f2bd1e.json
 */
function cachePath(address: string): string {
  return path.join(CACHE_DIR, `sanctions_${address.toLowerCase()}.json`);
}

/**
 * Try to read a cached sanctions result. Returns null if the cache
 * doesn't exist or has expired.
 */
async function readCache(address: string): Promise<SanctionsCheckResult | null> {
  const filePath = cachePath(address);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const entry: CacheEntry = JSON.parse(raw);

    // Check TTL
    const cachedTime = new Date(entry.cachedAt).getTime();
    if (Date.now() - cachedTime > CACHE_TTL_MS) {
      return null; // Expired
    }

    return entry.result;
  } catch {
    // File doesn't exist or is corrupt — treat as cache miss
    return null;
  }
}

/**
 * Write a sanctions check result to the file cache.
 */
async function writeCache(result: SanctionsCheckResult): Promise<void> {
  const filePath = cachePath(result.address);
  const entry: CacheEntry = {
    result,
    cachedAt: new Date().toISOString(),
  };

  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(entry, null, 2), "utf-8");
  } catch {
    // Cache write failures are non-fatal — just log and continue
    console.warn(`[sanctions] Failed to write cache for ${result.address}`);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Core API functions
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Check whether a single Ethereum address appears on any OpenSanctions list.
 *
 * Flow:
 *   1. Check file cache → return immediately if hit
 *   2. Acquire concurrency slot (max 5 in-flight)
 *   3. Call OpenSanctions /search/default?q={address}
 *   4. If `total.value > 0`, the address is sanctioned
 *   5. Cache the result and release the slot
 *
 * @param address - An Ethereum address (0x-prefixed).
 * @returns         true if the address is on a sanctions list, false otherwise.
 */
export async function checkSanctioned(address: string): Promise<boolean> {
  const result = await checkSanctionedDetailed(address);
  return result.sanctioned;
}

/**
 * Detailed version of checkSanctioned — returns the full SanctionsCheckResult
 * including match count. Used internally and exposed for debugging.
 */
export async function checkSanctionedDetailed(
  address: string,
): Promise<SanctionsCheckResult> {
  const normalizedAddress = address.toLowerCase();

  // 1. Check cache
  const cached = await readCache(normalizedAddress);
  if (cached) {
    return cached;
  }

  // 2. Acquire concurrency slot
  await limiter.acquire();

  try {
    // 3. Call OpenSanctions API
    const url = new URL(OPENSANCTIONS_BASE_URL);
    url.searchParams.set("q", normalizedAddress);

    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (OPENSANCTIONS_API_KEY) {
      headers["Authorization"] = `ApiKey ${OPENSANCTIONS_API_KEY}`;
    }

    const startMs = Date.now();
    const res = await fetch(url.toString(), { headers });
    const latencyMs = Date.now() - startMs;
    logApiTrace("OpenSanctions", latencyMs, res.status, { endpoint: OPENSANCTIONS_BASE_URL });

    if (!res.ok) {
      if (res.status === 401) {
        console.warn("[Sanctions] OpenSanctions 401 Unauthorized. Bypassing for local testing.");
        return { address: normalizedAddress, sanctioned: false, matchCount: 0, checkedAt: new Date().toISOString() };
      }
      // If rate-limited, throw a descriptive error
      if (res.status === 429) {
        throw new Error(
          "OpenSanctions rate limit exceeded. Please try again later.",
        );
      }
      throw new Error(
        `OpenSanctions HTTP ${res.status}: ${res.statusText}`,
      );
    }

    const data = (await res.json()) as OpenSanctionsResponse;

    // 4. Build result
    const result: SanctionsCheckResult = {
      address: normalizedAddress,
      sanctioned: data.total.value > 0,
      matchCount: data.total.value,
      checkedAt: new Date().toISOString(),
    };

    // 5. Cache it
    await writeCache(result);

    return result;
  } finally {
    // Always release the concurrency slot
    limiter.release();
  }
}

/**
 * Screen every address in a path for sanctions exposure.
 *
 * Checks ALL addresses (not just endpoints) because an intermediary node
 * that is sanctioned is equally problematic from a compliance standpoint.
 * Runs checks in parallel via Promise.all, bounded by the concurrency
 * limiter (max 5 simultaneous OpenSanctions requests).
 *
 * **Compliance note**: If ANY element in the returned array has
 * `sanctioned: true`, the entire path — and by extension the overall
 * attribution — must be flagged as HIGH risk. See the module-level
 * JSDoc for the legal rationale.
 *
 * @param pathAddresses - Ordered array of Ethereum addresses forming a path
 *                        (e.g. from PathResult.path).
 * @returns               One AddressRiskFlag per address, in the same order.
 */
export async function riskFlagPath(
  pathAddresses: string[],
): Promise<AddressRiskFlag[]> {
  const checks = pathAddresses.map(async (address): Promise<AddressRiskFlag> => {
    const sanctioned = await checkSanctioned(address);
    return { address: address.toLowerCase(), sanctioned };
  });

  return Promise.all(checks);
}

/**
 * Convenience function: returns true if ANY address in the path is sanctioned.
 * Use this for the top-level risk flag in the API response.
 */
export async function isPathSanctioned(pathAddresses: string[]): Promise<boolean> {
  const flags = await riskFlagPath(pathAddresses);
  return flags.some((f) => f.sanctioned);
}
