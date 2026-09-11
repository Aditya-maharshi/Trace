/**
 * app/api/attribute/route.ts
 *
 * Next.js App Router GET handler for wallet → VASP attribution.
 *
 * Usage:
 *   GET /api/attribute?address=0x742d35Cc6634C0532925a3b844Bc9e7595f2bD1e
 *
 * Features:
 *   S1 — ENS name resolution for all addresses in every path
 *   S2 — Mixer/Tornado Cash exposure detection
 *   S3 — Score breakdown (explainability) per path
 *   S4 — Top-3 VASP candidates ranked by combined score
 *
 * Response shape:
 *   {
 *     wallet:                string,
 *     nearestVasp:           string | null,
 *     nearestVaspLabel:      string | null,
 *     hops:                  number | null,
 *     confidence:            "High" | "Medium" | "Low" | null,
 *     score:                 number | null,
 *     paths:                 ScoredAttribution[],   // includes breakdown per path
 *     risk:                  "HIGH" | "LOW",
 *     structuringSignalDetected: boolean,
 *     sanctionsDetail:       Array<{address, sanctioned}>,
 *     ensNames:              Record<string, string>, // S1 — omits nulls
 *     mixerExposure:         Array<{address, label, hopIndex}>, // S2
 *     confidenceThresholds:  { high: number; medium: number }, // S3
 *     topVasps:              Array<{vasp, vaspLabel, bestHops, confidence, combinedScore, risk}>, // S4
 *     bridgeExitPoints:      BridgeExitPoint[],
 *     traceExitedToBridge:   boolean,
 *     incompleteTraversal:   { skippedNodes: number },
 *     methodology:           MethodologyDisclosure,
 *   }
 */

import { NextRequest, NextResponse } from "next/server";

import { findNearestVASP } from "../../../lib/graphBuilder";
import { buildVaspSet } from "../../../lib/vaspLabels";
import { logLookup } from "../../../lib/auditLog";
import { isValidEthAddress } from "../../../lib/validation";
import { buildAttributionResponse } from "../../../lib/buildAttributionResponse";
import type { AttributionResponse } from "../../../../../packages/shared-types";
import { requestContextStorage } from "../../../lib/logger";
import crypto from "crypto";

interface ErrorResponse {
  error: string;
  details?: string;
}



// ──────────────────────────────────────────────────────────────────────────────
// Route handler
// ──────────────────────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
): Promise<NextResponse<AttributionResponse | ErrorResponse>> {
  const reqId = crypto.randomUUID();
  const { searchParams } = request.nextUrl;
  const address = searchParams.get("address") || "";

  return requestContextStorage.run({ requestId: reqId, walletAddress: address }, async () => {
    try {
      // ── 1. Extract and validate the address param ────────────────────────

      if (!address) {
        return NextResponse.json(
          {
            error: "Missing required query parameter: address",
            details: "Usage: GET /api/attribute?address=0x...",
          },
          { status: 400 },
        );
      }

      if (!isValidEthAddress(address)) {
        return NextResponse.json(
          {
            error: "Invalid Ethereum address format",
            details:
              "Address must match 0x followed by 40 hex characters (e.g. 0x742d35Cc6634C0532925a3b844Bc9e7595f2bD1e)",
          },
          { status: 400 },
        );
      }

      // ── 2. Run BFS and build response ───────────────────────────────────

      const vaspSet = buildVaspSet();
      const paths = await findNearestVASP(address, vaspSet);
      
      const response = await buildAttributionResponse(address, paths);

      // ── 9. Fire-and-forget audit log ───────────────────────────────────
      //    Extract user_id from Authorization header (Supabase JWT) if present.
      const authHeader = request.headers.get("authorization") ?? "";
      let userId: string | null = null;
      if (authHeader.startsWith("Bearer ")) {
        try {
          const token = authHeader.slice(7);
          const payloadB64 = token.split(".")[1] ?? "";
          const payload = JSON.parse(
            Buffer.from(payloadB64, "base64").toString("utf-8"),
          );
          userId = payload.sub ?? null;
        } catch {
          // Malformed JWT — treat as anonymous
        }
      }

      logLookup({
        userId,
        queriedAddress: address.toLowerCase(),
        nearestVasp: response.nearestVasp,
        confidence: response.confidence,
        risk: response.risk,
        rawResponse: response as unknown as Record<string, unknown>,
        ipAddress:
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      }).catch(() => {}); // swallow — logged internally

      return NextResponse.json(response);
    } catch (err: unknown) {
      // ── Error handling ─────────────────────────────────────────────────

      // Check for Etherscan rate-limit errors specifically
      const message =
        err instanceof Error ? err.message : "Unknown internal error";

      const isRateLimit =
        message.includes("429") || message.toLowerCase().includes("rate limit");

      if (isRateLimit) {
        return NextResponse.json(
          {
            error: "Rate limited by upstream API (Etherscan)",
            details:
              "The Etherscan API rate limit has been exceeded. " +
              "Please wait a few seconds and try again, or set ETHERSCAN_API_KEY " +
              "for a higher quota.",
          },
          { status: 429 },
        );
      }

      console.error("[/api/attribute] Unhandled error:", err);

      return NextResponse.json(
        {
          error: "Internal server error during VASP attribution",
          details: message,
        },
        { status: 500 },
      );
    }
  });
}
