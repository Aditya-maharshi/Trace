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
import { findNearestVASP, type BfsProgressEvent } from "../../../lib/graphBuilder";
import { buildVaspSet } from "../../../lib/vaspLabels";
import { buildAttributionResponse } from "../../../lib/buildAttributionResponse";
import { requestContextStorage } from "../../../lib/logger";
import crypto from "crypto";
import { isValidEthAddress } from "../../../lib/validation";
import { logLookup } from "../../../lib/auditLog";

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

          // Fire-and-forget audit log
          const authHeader = request.headers.get("authorization") ?? "";
          let userId: string | null = null;
          if (authHeader.startsWith("Bearer ")) {
            try {
              const token = authHeader.slice(7);
              const payloadB64 = token.split(".")[1] ?? "";
              const payload = JSON.parse(Buffer.from(payloadB64, "base64").toString("utf-8"));
              userId = payload.sub ?? null;
            } catch {
              // Malformed JWT — anonymous
            }
          }
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
          enqueue(sseEvent("error", { message }));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": request.headers.get("origin") || "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
      },
    });
  });
}
