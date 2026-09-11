/**
 * __tests__/lib/rateLimit.test.ts
 *
 * Unit tests for distributed and in-memory rate limiting with fail-open fallback.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkRateLimit, resetInMemoryRateLimit } from "../../lib/rateLimit";
import { setRedisClientForTesting, resetRedisClient } from "../../lib/redis";
import type { Redis } from "@upstash/redis";

describe("Rate Limiting (In-Memory & Upstash Redis)", () => {
  beforeEach(() => {
    resetInMemoryRateLimit();
    resetRedisClient();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    resetInMemoryRateLimit();
    resetRedisClient();
  });

  describe("In-Memory Mode (No Redis)", () => {
    it("allows requests below the limit", async () => {
      const cors = { "Access-Control-Allow-Origin": "*" };
      const res1 = await checkRateLimit("test-caller", 2, 60000, cors);
      const res2 = await checkRateLimit("test-caller", 2, 60000, cors);

      expect(res1).toBeNull();
      expect(res2).toBeNull();
    });

    it("blocks requests exceeding the limit with 429 and Retry-After header", async () => {
      const cors = { "Access-Control-Allow-Origin": "*" };
      await checkRateLimit("test-caller", 2, 60000, cors);
      await checkRateLimit("test-caller", 2, 60000, cors);
      const res3 = await checkRateLimit("test-caller", 2, 60000, cors);

      expect(res3).not.toBeNull();
      expect(res3?.status).toBe(429);
      expect(res3?.headers.get("Retry-After")).toBeDefined();
      expect(res3?.headers.get("Access-Control-Allow-Origin")).toBe("*");

      const body = await res3?.json();
      expect(body.error).toContain("Too many requests");
    });

    it("resets limit once window duration has elapsed", async () => {
      const cors = {};
      const now = Date.now();
      vi.spyOn(Date, "now").mockReturnValue(now);

      await checkRateLimit("test-caller", 1, 1000, cors);
      const blocked = await checkRateLimit("test-caller", 1, 1000, cors);
      expect(blocked?.status).toBe(429);

      // Fast-forward past window
      vi.spyOn(Date, "now").mockReturnValue(now + 1001);
      const allowedAfterReset = await checkRateLimit("test-caller", 1, 1000, cors);
      expect(allowedAfterReset).toBeNull();
    });
  });

  describe("Distributed Redis Mode", () => {
    it("increments Redis counter and sets TTL on first request", async () => {
      const mockIncr = vi.fn().mockResolvedValue(1);
      const mockPexpire = vi.fn().mockResolvedValue(1);
      const mockPttl = vi.fn().mockResolvedValue(59000);

      const mockRedis = {
        incr: mockIncr,
        pexpire: mockPexpire,
        pttl: mockPttl,
      } as unknown as Redis;

      setRedisClientForTesting(mockRedis);

      const res = await checkRateLimit("redis-caller", 5, 60000);
      expect(res).toBeNull();
      expect(mockIncr).toHaveBeenCalledWith("ratelimit:redis-caller");
      expect(mockPexpire).toHaveBeenCalledWith("ratelimit:redis-caller", 60000);
    });

    it("returns 429 when Redis count exceeds max requests", async () => {
      const mockIncr = vi.fn().mockResolvedValue(6);
      const mockPexpire = vi.fn().mockResolvedValue(1);
      const mockPttl = vi.fn().mockResolvedValue(45000);

      const mockRedis = {
        incr: mockIncr,
        pexpire: mockPexpire,
        pttl: mockPttl,
      } as unknown as Redis;

      setRedisClientForTesting(mockRedis);

      const res = await checkRateLimit("redis-caller", 5, 60000);
      expect(res).not.toBeNull();
      expect(res?.status).toBe(429);
      expect(res?.headers.get("Retry-After")).toBe("45"); // 45000ms -> 45s
    });

    it("fails open on Redis error without throwing 500 or blocking user", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const mockRedis = {
        incr: vi.fn().mockRejectedValue(new Error("Connection timeout to Upstash")),
      } as unknown as Redis;

      setRedisClientForTesting(mockRedis);

      // Must fail open (return null)
      const res = await checkRateLimit("redis-caller", 5, 60000);
      expect(res).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Persistent KV store unreachable"),
      );
    });
  });
});
