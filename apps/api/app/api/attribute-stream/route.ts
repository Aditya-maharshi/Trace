/**
 * app/api/attribute-stream/route.ts
 *
 * Server-Sent Events (SSE) streaming version of the wallet attribution endpoint.
 * Emits real-time BFS progress events as the graph traversal proceeds.
 *
 * Usage:
 *   GET /api/attribute-stream?address=0x...
 *   (Must include x-api-key header, same as /api/attribute)
 *
 * SSE Event format:
 *   event: progress
 *   data: {"type":"exploring","address":"0x...","depth":1,"queueLength":5}
 *
 *   event: complete
 *   data: { ...full AttributionResponse... }
 *
 *   event: error
 *   data: {"message":"..."}
 */

import { NextRequest } from "next/server";
import { findNearestVASP, type BfsProgressEvent } from "../../../lib/domains/tracing/graphBuilder";
import { buildVaspSet } from "../../../lib/domains/tracing/vaspLabels";
import { buildAttributionResponse } from "../../../lib/domains/tracing/buildAttributionResponse";
import { requestContextStorage, logError } from "../../../lib/domains/core/logger";
import { extractVerifiedUserIdAsync } from "../../../lib/domains/auth/verifyJwt";
import crypto from "crypto";
import { isValidEthAddress } from "../../../lib/domains/core/validation";
import { logLookup } from "../../../lib/domains/core/auditLog";
import { storeAttributionResult } from "../../../lib/domains/core/resultStore";

/** Stay within Vercel Hobby's 10s hard cap so we can emit a partial SSE complete event. */
export const maxDuration = 10;

/** Format a single SSE event frame. */
function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** Translate a BfsProgressEvent into a human-readable status message. */
function progressToMessage(evt: BfsProgressEvent): string {
  switch (evt.type) {
    case "exploring":
      return `Exploring ${evt.address.slice(0, 8)}… (depth ${evt.depth}, ${evt.queueLength} queued)`;
    case "fetched":
      return `Fetched ${evt.txCount} transactions for ${evt.address.slice(0, 8)}… → ${evt.neighborCount} neighbors`;
    case "vasp_found":
      return `✓ VASP found at hop ${evt.depth}: ${evt.address.slice(0, 8)}…`;
    case "pruned":
      return evt.reason === "maxDepth"
        ? `⏹ Max depth reached at ${evt.address.slice(0, 8)}…`
        : `⚠ Skipped ${evt.address.slice(0, 8)}… (fetch error)`;
    case "done":
      return `BFS complete — visited ${evt.totalVisited} nodes, found ${evt.resultsFound} path(s)`;
  }
}

export async function GET(request: NextRequest) {
  const reqId = crypto.randomUUID();
  const { searchParams } = request.nextUrl;
  const address = searchParams.get("address") || "";

  return requestContextStorage.run({ requestId: reqId, walletAddress: address }, async () => {
    // ── Validation ─────────────────────────────────────────────────────────────
    if (!address) {
      return new Response(
        sseEvent("error", { message: "Missing required query parameter: address" }),
        { status: 400, headers: { "Content-Type": "text/event-stream" } },
      );
    }

    if (!isValidEthAddress(address)) {
      return new Response(
        sseEvent("error", {
          message: "Invalid Ethereum address format. Must match 0x followed by 40 hex chars.",
        }),
        { status: 400, headers: { "Content-Type": "text/event-stream" } },
      );
    }

    // ── Stream ─────────────────────────────────────────────────────────────────
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const enqueue = (data: string) => {
          try {
            controller.enqueue(encoder.encode(data));
          } catch {
            // Client disconnected
          }
        };

        try {
          const vaspSet = buildVaspSet();

          // BFS with live progress callback
          const paths = await findNearestVASP(
            address,
            vaspSet,
            3,
            15,
            undefined,
            (evt: BfsProgressEvent) => {
              enqueue(
                sseEvent("progress", {
                  ...evt,
                  message: progressToMessage(evt),
                }),
              );
            },
          );

          // Build full attribution response using shared pipeline
          const result = await buildAttributionResponse(address, paths);

          await storeAttributionResult(reqId, result).catch((err) => {
            console.warn("[/api/attribute-stream] Failed to persist trace for report generation:", err);
          });

          // Fire-and-forget audit log — use shared verified JWT extraction
          const authHeader = request.headers.get("authorization") ?? "";
          const userId = await extractVerifiedUserIdAsync(authHeader);

          logLookup({
            userId,
            queriedAddress: address.toLowerCase(),
            nearestVasp: result.nearestVasp,
            confidence: result.confidence,
            risk: result.risk,
            rawResponse: result as unknown as Record<string, unknown>,
            ipAddress:
              request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
          }).catch(() => {});

          enqueue(sseEvent("complete", result));
          controller.close();
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Unknown internal error";
          logError(err, { route: "/api/attribute-stream" });
          enqueue(sseEvent("error", { message }));
          controller.close();
        }
      },
    });

    // CORS headers are handled centrally by middleware.ts — do not set them
    // inline here, as that would bypass the middleware's origin validation.
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  });
}
