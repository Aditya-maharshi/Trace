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
import { getRedisClient } from "../core/redis";

interface WindowEntry {
  count: number;
  resetAt: number; // epoch ms
}

const inMemoryRateLimitMap = new Map<string, WindowEntry>();

/** Clear in-memory rate limit table (useful for test isolation). */
export function resetInMemoryRateLimit(): void {
  inMemoryRateLimitMap.clear();
}

export type RateLimitTier = "guest" | "user" | "paid";

export interface RateLimitIdentity {
  /** Redis / in-memory counter key (already namespaced by tier). */
  key: string;
  maxReqs: number;
  windowMs: number;
  tier: RateLimitTier;
}

function parseCsvEnv(value: string): string[] {
  return value
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

/**
 * Isolate free/guest traffic from paid API-key traffic, and isolate tenants
 * from each other. Shared frontend keys are treated as guest and keyed by IP
 * so one noisy NAT user cannot exhaust a paid key's window.
 */
export function resolveRateLimitIdentity(opts: {
  presentedKey: string;
  validKeys: string[];
  publicKeys: string[];
  userId: string | null;
  ip: string;
}): RateLimitIdentity {
  const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000;
  const guestMax = Number(process.env.RATE_LIMIT_GUEST_MAX) || 30;
  const userMax = Number(process.env.RATE_LIMIT_USER_MAX) || 60;
  const paidMax =
    Number(process.env.RATE_LIMIT_PAID_MAX) || Number(process.env.RATE_LIMIT_MAX) || 300;
  const ip = opts.ip || "unknown";

  const isValidKey = Boolean(opts.presentedKey) && opts.validKeys.includes(opts.presentedKey);
  const isPublicKey =
    isValidKey &&
    (opts.publicKeys.length === 0
      ? false
      : opts.publicKeys.includes(opts.presentedKey));

  if (isValidKey && !isPublicKey) {
    // When PUBLIC_API_KEYS is unset, also isolate by IP so a shared frontend
    // key cannot let one caller exhaust the window for every other tenant.
    const key =
      opts.publicKeys.length === 0
        ? `paid:${opts.presentedKey}:ip:${ip}`
        : `paid:${opts.presentedKey}`;
    return {
      key,
      maxReqs: paidMax,
      windowMs,
      tier: "paid",
    };
  }

  if (opts.userId) {
    return {
      key: `user:${opts.userId}`,
      maxReqs: userMax,
      windowMs,
      tier: "user",
    };
  }

  return {
    key: `guest:${ip}`,
    maxReqs: guestMax,
    windowMs,
    tier: "guest",
  };
}

export function parseApiKeyLists(): { validKeys: string[]; publicKeys: string[] } {
  const validKeys = parseCsvEnv(process.env.API_KEYS ?? "");
  const publicKeys = parseCsvEnv(process.env.PUBLIC_API_KEYS ?? process.env.FRONTEND_API_KEY ?? "");
  return { validKeys, publicKeys };
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

        console.warn(JSON.stringify({
          event: "security_alert",
          type: "rate_limit_exceeded",
          tier,
          key,
          count,
          limit: maxReqs,
          timestamp: new Date().toISOString()
        }));

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
        `[rateLimit] Persistent KV store unreachable for key ${key} (${errorMsg}). Falling back to in-memory store to protect availability.`,
      );
      // Fall through to in-memory map
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

/**
 * Checks if the caller has exceeded their monthly usage quota.
 * Quota checks are fast Redis reads. Increments happen durably after successful events.
 *
 * @param orgId         - Organization ID
 * @param overagePolicy - "hard_stop" or "soft_overage"
 * @param corsHeaders   - Headers for 429 errors
 */
export async function checkUsageQuota(
  orgId: string,
  overagePolicy: string,
  corsHeaders: Record<string, string> = {},
): Promise<NextResponse | null> {
  const maxQuota = Number(process.env.QUOTA_MAX_MONTHLY) || 10000;
  
  const redis = getRedisClient();
  if (!redis) {
     return null; // Fail open if Redis is down
  }

  const date = new Date();
  const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const redisKey = `usage:${orgId}:${monthKey}`;

  try {
     const usageStr = await redis.get<number>(redisKey);
     const usage = Number(usageStr) || 0;

     if (usage >= maxQuota) {
        if (overagePolicy === "hard_stop") {
           return NextResponse.json(
             { error: "Monthly usage quota exceeded. Upgrade plan for more capacity." },
             { status: 429, headers: corsHeaders }
           );
        }
        // If soft_overage, allow it through (it will be billed as overage)
     }
  } catch (err) {
     console.warn(`[rateLimit] Failed to read quota for org ${orgId}. Failing open.`, err);
  }

  return null;
}
