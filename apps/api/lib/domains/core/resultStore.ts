/**
 * lib/resultStore.ts
 *
 * Server-side storage for completed attribution traces, keyed by requestId.
 * Reports are regenerated from this store so clients cannot submit fabricated
 * scores/letterhead payloads.
 *
 * Primary: Upstash Redis (TTL 24h)
 * Fallback: in-memory Map (local/dev only — does not survive serverless cold starts)
 */

import type { AttributionResponse } from "../../../packages/shared-types";
import { getRedisClient } from "../core/redis";

const RESULT_TTL_SECONDS = 24 * 60 * 60;
const MEMORY_TTL_MS = RESULT_TTL_SECONDS * 1000;

const REQUEST_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface MemoryEntry {
  data: AttributionResponse;
  expiresAt: number;
}

const memoryStore = new Map<string, MemoryEntry>();

export function isValidRequestId(id: string): boolean {
  return REQUEST_ID_RE.test(id);
}

function redisKey(requestId: string): string {
  return `result:${requestId}`;
}

function pruneMemoryStore(now = Date.now()): void {
  for (const [key, entry] of memoryStore) {
    if (entry.expiresAt <= now) {
      memoryStore.delete(key);
    }
  }
}

/** Test helper — wipe the in-memory fallback table. */
export function resetInMemoryResultStore(): void {
  memoryStore.clear();
}

export async function storeAttributionResult(
  requestId: string,
  data: AttributionResponse,
): Promise<void> {
  const payload: AttributionResponse = { ...data, requestId };

  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.set(redisKey(requestId), payload, { ex: RESULT_TTL_SECONDS });
      return;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[resultStore] Redis write failed for ${requestId} (${errorMsg}). Falling back to in-memory store.`,
      );
    }
  }

  pruneMemoryStore();
  memoryStore.set(requestId, {
    data: payload,
    expiresAt: Date.now() + MEMORY_TTL_MS,
  });
}

export async function loadAttributionResult(
  requestId: string,
): Promise<AttributionResponse | null> {
  if (!isValidRequestId(requestId)) {
    return null;
  }

  const redis = getRedisClient();
  if (redis) {
    try {
      const cached = await redis.get<AttributionResponse>(redisKey(requestId));
      if (cached && typeof cached === "object") {
        return cached;
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[resultStore] Redis read failed for ${requestId} (${errorMsg}). Falling back to in-memory store.`,
      );
    }
  }

  pruneMemoryStore();
  const entry = memoryStore.get(requestId);
  if (!entry || entry.expiresAt <= Date.now()) {
    memoryStore.delete(requestId);
    return null;
  }
  return entry.data;
}
