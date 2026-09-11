import crypto from "crypto";
import { AsyncLocalStorage } from "node:async_hooks";

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
