/**
 * __tests__/lib/redisCache.test.ts
 *
 * Unit tests for Upstash Redis persistent caching with local fallback.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  readCache,
  writeCache,
  clearTransactionCache,
  type Transaction,
} from "../../lib/domains/tracing/etherscan";
import { setRedisClientForTesting, resetRedisClient } from "../../lib/domains/core/redis";
import type { Redis } from "@upstash/redis";

describe("Persistent Redis Caching (lib/etherscan.ts)", () => {
  const sampleData: Transaction[] = [
    {
      hash: "0x123",
      from: "0xaaa",
      to: "0xbbb",
      value: "1000",
      blockNumber: "50",
      timeStamp: "1600000000",
    },
  ];

  beforeEach(async () => {
    resetRedisClient();
    await clearTransactionCache();
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    resetRedisClient();
    await clearTransactionCache();
  });

  it("reads from Redis cache when key exists", async () => {
    const mockGet = vi.fn().mockResolvedValue({
      data: sampleData,
      cachedAt: Date.now(),
      expiresAt: Date.now() + 60000,
    });

    const mockRedis = {
      get: mockGet,
      set: vi.fn(),
    } as unknown as Redis;

    setRedisClientForTesting(mockRedis);

    const result = await readCache<Transaction[]>("tx_0xabc_100");
    expect(mockGet).toHaveBeenCalledWith("cache:tx_0xabc_100");
    expect(result).toEqual({ data: sampleData, cachedAt: expect.any(Number) });
  });

  it("writes to Redis cache with TTL", async () => {
    const mockSet = vi.fn().mockResolvedValue("OK");

    const mockRedis = {
      get: vi.fn().mockResolvedValue(null),
      set: mockSet,
    } as unknown as Redis;

    setRedisClientForTesting(mockRedis);

    await writeCache("tx_0xabc_100", sampleData, 30000);
    expect(mockSet).toHaveBeenCalledWith(
      "cache:tx_0xabc_100",
      expect.objectContaining({
        data: sampleData,
      }),
      { px: 30000 },
    );
  });

  it("falls back to local cache when Redis read fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Write to local cache first without Redis
    setRedisClientForTesting(null);
    await writeCache("tx_0xfallback_100", sampleData);

    // Now enable mock Redis that throws error
    const mockRedis = {
      get: vi.fn().mockRejectedValue(new Error("Redis connection refused")),
      set: vi.fn(),
    } as unknown as Redis;

    setRedisClientForTesting(mockRedis);

    const result = await readCache<Transaction[]>("tx_0xfallback_100");
    // Should successfully retrieve from local in-memory/disk fallback
    expect(result).toEqual({ data: sampleData, cachedAt: expect.any(Number) });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Persistent Redis cache read failed"),
    );
  });

  it("clears Redis keys during clearTransactionCache", async () => {
    const mockKeys = vi.fn().mockImplementation((pattern: string) => {
      if (pattern === "cache:tokentx_*") return Promise.resolve(["cache:tokentx_1"]);
      return Promise.resolve(["cache:tx_1", "cache:tx_2"]);
    });
    const mockDel = vi.fn().mockResolvedValue(3);

    const mockRedis = {
      keys: mockKeys,
      del: mockDel,
    } as unknown as Redis;

    setRedisClientForTesting(mockRedis);

    await clearTransactionCache();
    expect(mockDel).toHaveBeenCalledWith("cache:tx_1", "cache:tx_2", "cache:tokentx_1");
  });
});
