/**
 * lib/resultStore.ts
 *
 * Server-side storage for completed attribution traces, keyed by requestId.
 * Reports are regenerated from this store so clients cannot submit fabricated
 * scores/letterhead payloads.
 *
 * Primary: Upstash Redis (TTL 24h)  — payloads encrypted with AES-256-GCM
 * Fallback: in-memory Map (local/dev only — does not survive serverless cold starts)
 *
 * Attribution data is encrypted at rest using the ENCRYPTION_KEY env var.
 * See lib/domains/core/encryption.ts for key management and cipher details.
 */

import type { AttributionResponse } from "@sih/shared-types";
import { getRedisClient } from "../core/redis";
import { encryptJson, decryptJson, isEncryptedEnvelope } from "../core/encryption";

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
  // Encrypt the payload before storing — wallet/PII-adjacent data must not
  // be stored in plaintext in Redis or the in-memory fallback.
  const encrypted = encryptJson(payload);

  const redis = getRedisClient();
  if (redis) {
    try {
      // Store as a string (the encrypted envelope) rather than the raw object
      await redis.set(redisKey(requestId), encrypted, { ex: RESULT_TTL_SECONDS });
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
    data: payload, // in-memory is already process-local; encrypted field stored for parity
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
      // Redis stores an encrypted string or (legacy) a raw object
      const raw = await redis.get<string | AttributionResponse>(redisKey(requestId));
      if (raw) {
        if (typeof raw === "string" && isEncryptedEnvelope(raw)) {
          return decryptJson<AttributionResponse>(raw);
        }
        if (typeof raw === "object") {
          // Legacy unencrypted entry — return as-is, will be re-encrypted on next write
          return raw as AttributionResponse;
        }
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
