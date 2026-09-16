import crypto from "crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { captureException } from "./sentry";

export interface RequestContext {
  requestId: string;
  walletAddress: string;
  dataSource?: "live" | "cached-fixture";
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function hashAddress(address: string): string {
  if (!address) return "unknown";
  return crypto.createHash("sha256").update(address.toLowerCase()).digest("hex").slice(0, 10);
}

/**
 * Pseudonymize a client IP before persistence (HMAC-SHA256, truncated).
 * Never store raw IPs in the audit table.
 */
let missingIpSaltWarned = false;

export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const pepper =
    process.env.IP_HASH_SALT || process.env.SUPABASE_JWT_SECRET || "trace-ip-pseudonym";
  if (!process.env.IP_HASH_SALT && process.env.NODE_ENV === "production" && !missingIpSaltWarned) {
    missingIpSaltWarned = true;
    console.warn(
      "[logger] IP_HASH_SALT is not set — hashing IPs with a fallback pepper. Set IP_HASH_SALT in production.",
    );
  }
  const digest = crypto.createHmac("sha256", pepper).update(ip.trim()).digest("hex").slice(0, 16);
  return `h:${digest}`;
}

/** Structured error log + optional Sentry capture (no-ops without SENTRY_DSN). */
export function logError(error: unknown, extraContext?: Record<string, unknown>): void {
  const ctx = requestContextStorage.getStore();
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  console.error(
    JSON.stringify({
      level: "error",
      timestamp: new Date().toISOString(),
      reqId: ctx?.requestId || "unknown-req",
      walletHash: ctx?.walletAddress ? hashAddress(ctx.walletAddress) : undefined,
      message,
      stack,
      ...extraContext,
    }),
  );
  captureException(error, extraContext);
}

export function logApiTrace(
  targetService: string,
  latencyMs: number,
  status: number | string,
  extraContext?: Record<string, unknown>
) {
  const ctx = requestContextStorage.getStore();
  const requestId = ctx?.requestId || "unknown-req";
  const walletHash = ctx?.walletAddress ? hashAddress(ctx.walletAddress) : "unknown-wallet";

  const logEntry = {
    timestamp: new Date().toISOString(),
    reqId: requestId,
    service: targetService,
    walletHash,
    latencyMs,
    status,
    ...extraContext,
  };
  
  // In production, this might stream to Datadog / CloudWatch.
  // We use JSON.stringify for structured logging output.
  console.log(JSON.stringify(logEntry));
}
