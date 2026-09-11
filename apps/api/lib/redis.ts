/**
 * lib/redis.ts
 *
 * Persistent, serverless-friendly Redis client using Upstash Redis.
 * Supports Edge runtime, Serverless functions, and Node.js via HTTPS REST.
 *
 * Used for:
 * 1. Global distributed rate limiting across serverless instances.
 * 2. Shared transaction cache across instances.
 *
 * Falls back gracefully to in-memory / local disk caching when unconfigured
 * or unreachable.
 */

import { Redis } from "@upstash/redis";

let redisClient: Redis | null = null;
let isExplicitlySetForTesting = false;

/**
 * Returns the active Redis client if configured via environment variables
 * (or injected during tests), otherwise null.
 */
export function getRedisClient(): Redis | null {
  if (isExplicitlySetForTesting) {
    return redisClient;
  }

  if (redisClient) {
    return redisClient;
  }

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return null;
  }

  try {
    redisClient = new Redis({
      url,
      token,
    });
    return redisClient;
  } catch (err) {
    console.warn("[redis] Failed to initialize Upstash Redis client:", err);
    return null;
  }
}

/**
 * Returns true if Redis credentials are configured in the environment.
 */
export function isRedisConfigured(): boolean {
  return Boolean(
    isExplicitlySetForTesting
      ? redisClient
      : process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
  );
}

/**
 * Inject a mock Redis client for unit/integration tests.
 */
export function setRedisClientForTesting(mockClient: Redis | null): void {
  redisClient = mockClient;
  isExplicitlySetForTesting = true;
}

/**
 * Reset Redis client to read from environment variables again.
 */
export function resetRedisClient(): void {
  redisClient = null;
  isExplicitlySetForTesting = false;
}
