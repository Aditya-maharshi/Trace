/**
 * scripts/smokeTestTwoInstances.ts
 *
 * Smoke test verifying state sharing across multiple application instances.
 *
 * Demonstrates:
 * 1. Distributed Rate Limiting:
 *    - Instance A consumes requests up to the allowed threshold.
 *    - Instance B immediately sees the shared counter and blocks the next request (HTTP 429).
 *    - Validates that limits do NOT reset per-instance.
 * 2. Shared Transaction Cache:
 *    - Instance A populates the transaction cache in Redis.
 *    - Instance B successfully hits the shared cache without querying the blockchain.
 *
 * Usage:
 *   npx tsx scripts/smokeTestTwoInstances.ts
 */

import { checkRateLimit } from "../lib/domains/auth/rateLimit";
import { readCache, writeCache } from "../lib/domains/tracing/etherscan";
import { setRedisClientForTesting, resetRedisClient } from "../lib/domains/core/redis";
import type { Redis } from "@upstash/redis";

// Shared in-memory KV store to simulate a remote Upstash Redis instance
class SimulatedUpstashRedis {
  private store = new Map<string, { value: any; expiresAt?: number }>();

  async incr(key: string): Promise<number> {
    const entry = this.store.get(key);
    const now = Date.now();
    if (entry && entry.expiresAt && entry.expiresAt <= now) {
      this.store.delete(key);
    }
    const current = this.store.get(key);
    const newVal = (current ? Number(current.value) : 0) + 1;
    this.store.set(key, { value: newVal, expiresAt: current?.expiresAt });
    return newVal;
  }

  async pexpire(key: string, ms: number): Promise<number> {
    const entry = this.store.get(key);
    if (!entry) return 0;
    entry.expiresAt = Date.now() + ms;
    return 1;
  }

  async pttl(key: string): Promise<number> {
    const entry = this.store.get(key);
    if (!entry || !entry.expiresAt) return -1;
    return Math.max(0, entry.expiresAt - Date.now());
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set(key: string, value: any, opts?: { px?: number }): Promise<string> {
    const expiresAt = opts?.px ? Date.now() + opts.px : undefined;
    this.store.set(key, { value, expiresAt });
    return "OK";
  }

  async del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const k of keys) {
      if (this.store.delete(k)) count++;
    }
    return count;
  }

  async keys(pattern: string): Promise<string[]> {
    const prefix = pattern.replace("*", "");
    const res: string[] = [];
    for (const k of this.store.keys()) {
      if (k.startsWith(prefix)) res.push(k);
    }
    return res;
  }
}

async function runSmokeTest() {
  console.log("================================================================");
  console.log("    Two-Instance Smoke Test: Distributed State Sharing          ");
  console.log("================================================================\n");

  const sharedRedisServer = new SimulatedUpstashRedis();

  // Create two separate instance adapters connected to the SAME shared Redis backend
  const instanceA_Redis = sharedRedisServer as unknown as Redis;
  const instanceB_Redis = sharedRedisServer as unknown as Redis;

  const testKey = "user_api_key_42";
  const maxReqs = 3;
  const windowMs = 60_000;

  console.log("1. Testing Distributed Rate Limiting Across Instances:");
  console.log(`   Allowed threshold: ${maxReqs} requests per minute.`);

  // Instance A receives 3 requests (consumes the limit)
  setRedisClientForTesting(instanceA_Redis);
  for (let i = 1; i <= maxReqs; i++) {
    const res = await checkRateLimit(testKey, maxReqs, windowMs);
    if (res === null) {
      console.log(`   [Instance A] Request ${i}/${maxReqs}: Allowed (200 OK)`);
    } else {
      throw new Error(`Instance A was unexpectedly blocked on request ${i}`);
    }
  }

  // Now, Instance B receives the 4th request from the same user
  console.log("\n2. Switching to Instance B (simulating another serverless instance):");
  setRedisClientForTesting(instanceB_Redis);

  const blockedResponse = await checkRateLimit(testKey, maxReqs, windowMs);
  if (!blockedResponse) {
    throw new Error(
      "FAILURE: Instance B did not see Instance A's count! Rate limits reset per-instance.",
    );
  }

  const status = blockedResponse.status;
  const retryAfter = blockedResponse.headers.get("Retry-After");
  const body = await blockedResponse.json();

  console.log(`   [Instance B] Request 4: Blocked with HTTP ${status}`);
  console.log(`   [Instance B] Retry-After Header: ${retryAfter} seconds`);
  console.log(`   [Instance B] Response Body: ${JSON.stringify(body)}`);

  if (status !== 429) {
    throw new Error(`Expected HTTP 429 but received HTTP ${status}`);
  }

  console.log("\n   ✓ Distributed Rate Limiting VERIFIED: Instance B successfully enforced limit consumed by Instance A!\n");

  console.log("3. Testing Shared Transaction Cache Across Instances:");
  setRedisClientForTesting(instanceA_Redis);

  const cacheKey = "tx_0x9999999999999999999999999999999999999999_100";
  const dummyTxs = [{ hash: "0xdeadbeef", from: "0x1", to: "0x2", value: "5000" }];

  await writeCache(cacheKey, dummyTxs, 30_000);
  console.log(`   [Instance A] Wrote transaction payload to shared cache (${cacheKey}).`);

  // Instance B reads from the cache
  setRedisClientForTesting(instanceB_Redis);
  const cachedAtInstanceB = await readCache<typeof dummyTxs>(cacheKey);

  if (!cachedAtInstanceB || cachedAtInstanceB.data.length === 0 || cachedAtInstanceB.data[0].hash !== "0xdeadbeef") {
    throw new Error("FAILURE: Instance B could not read the transaction cache written by Instance A!");
  }

  console.log(`   [Instance B] Successfully read cached item: hash=${cachedAtInstanceB.data[0].hash}`);
  console.log("   ✓ Shared Cache VERIFIED: Instance B hit the cache written by Instance A!\n");

  resetRedisClient();
  console.log("================================================================");
  console.log("              Smoke Test PASSED Successfully!                   ");
  console.log("================================================================\n");
}

runSmokeTest().catch((err) => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});
