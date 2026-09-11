/**
 * lib/rateLimit.ts
 *
 * Distributed fixed-window rate limiter.
 *
 * Primary store: Upstash Redis (shared globally across serverless instances)
 * Fallback store: In-memory Map (for local development or when Redis is unconfigured)
 *
 * Resilient fail-open strategy:
 * If Redis is configured but throws a network error, times out, or becomes
 * unreachable, this limiter logs a warning and fails open (allows the request)
 * rather than bringing down the application.
 */

import { NextResponse } from "next/server";
import { getRedisClient } from "./redis";

interface WindowEntry {
  count: number;
  resetAt: number; // epoch ms
}

const inMemoryRateLimitMap = new Map<string, WindowEntry>();

/** Clear in-memory rate limit table (useful for test isolation). */
export function resetInMemoryRateLimit(): void {
  inMemoryRateLimitMap.clear();
}

/**
 * Checks if the caller has exceeded the rate limit.
 *
 * @param key         - Unique caller identifier (API key or IP)
 * @param maxReqs     - Max requests allowed within the window
 * @param windowMs    - Window duration in milliseconds
 * @param corsHeaders - Headers to attach so 429 errors are readable cross-origin
 * @returns           `null` if allowed, or `NextResponse(429)` if exceeded
 */
export async function checkRateLimit(
  key: string,
  maxReqs: number,
  windowMs: number,
  corsHeaders: Record<string, string> = {},
): Promise<NextResponse | null> {
  const redis = getRedisClient();

  if (redis) {
    try {
      const redisKey = `ratelimit:${key}`;

      // Increment counter atomically
      const count = await redis.incr(redisKey);

      // Set expiry on first request in window
      if (count === 1) {
        await redis.pexpire(redisKey, windowMs);
      }

      if (count > maxReqs) {
        const ttlMs = await redis.pttl(redisKey);
        const retryAfterSec = Math.max(1, Math.ceil((ttlMs > 0 ? ttlMs : windowMs) / 1000));

        return NextResponse.json(
          { error: "Too many requests. Please retry later." },
          {
            status: 429,
            headers: {
              ...corsHeaders,
              "Retry-After": String(retryAfterSec),
            },
          },
        );
      }

      return null;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[rateLimit] Persistent KV store unreachable for key ${key} (${errorMsg}). Failing open to protect availability.`,
      );
      // Fail-open: allow request rather than breaking availability during KV outages
      return null;
    }
  }

  // Fallback: In-memory rate limiting when Redis is not configured
  const now = Date.now();
  let entry = inMemoryRateLimitMap.get(key);

  if (!entry || now >= entry.resetAt) {
    entry = { count: 1, resetAt: now + windowMs };
    inMemoryRateLimitMap.set(key, entry);
    return null;
  }

  entry.count += 1;

  if (entry.count > maxReqs) {
    const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    return NextResponse.json(
      { error: "Too many requests. Please retry later." },
      {
        status: 429,
        headers: {
          ...corsHeaders,
          "Retry-After": String(retryAfterSec),
        },
      },
    );
  }

  return null;
}
