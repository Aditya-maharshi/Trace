/**
 * lib/traceAI/tools/checkSanctionsStatus.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tool: check_sanctions_status
 *
 * INVARIANT: This tool NEVER collapses an API failure into NO_MATCH.
 *   A timeout or unavailable source returns UNKNOWN with a reason.
 *   This is a load-bearing compliance requirement.
 *
 * INTEGRATION NOTE:
 *   The actual sanctions screening is called via a shared domain function
 *   (lib/sanctions.ts in the main project). This handler is a thin adapter.
 *   When integrating, replace the stub below with the real domain call.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { z } from "zod";
import type { TraceToolResult, EvidenceReference, SanctionsDetail } from "../types";
import type { ToolExecutionContext } from "./registry";

const InputSchema = z.object({
  address: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, "Must be a valid Ethereum address (0x + 40 hex chars)"),
});

export async function executeCheckSanctionsStatus(
  rawInput: unknown,
  context: ToolExecutionContext
): Promise<TraceToolResult> {
  const executedAt = new Date().toISOString();
  const startMs = Date.now();

  // ── Input Validation ──────────────────────────────────────────────────────
  const parseResult = InputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    return {
      callId: "",
      toolName: "check_sanctions_status",
      status: "validation_failed",
      output: null,
      provenance: {
        toolName: "check_sanctions_status",
        executedAt,
        source: "opensanctions",
        durationMs: 0,
      },
      error: {
        code: "INVALID_ADDRESS",
        message: parseResult.error.message,
        userMessage: "Invalid Ethereum address format. Address must be 0x followed by 40 hex characters.",
      },
    };
  }

  const { address } = parseResult.data;

  // ── Check if result already has sanctions data for this address ───────────
  // Prefer using existing deterministic result rather than re-querying
  if (
    context.attributionResult?.address.toLowerCase() === address.toLowerCase() &&
    context.attributionResult?.sanctionsDetail
  ) {
    const existing = context.attributionResult.sanctionsDetail;
    return buildSanctionsResult(address, existing, executedAt, Date.now() - startMs, "trace_engine");
  }

  // ── Call shared domain sanctions function ─────────────────────────────────
  // INTEGRATION: Replace this stub with: await screenSanctions(address)
  // from your main project's lib/sanctions.ts
  //
  // The stub returns UNKNOWN to correctly represent an unverified source.
  // Do NOT change this to NO_MATCH without a real implementation.
  try {
    const result = await callSanctionsDomainFunction(address);
    return buildSanctionsResult(address, result, executedAt, Date.now() - startMs, "opensanctions");
  } catch (err: unknown) {
    // INVARIANT: Error → UNKNOWN, never NO_MATCH
    const isTimeout = err instanceof Error && err.message.includes("timeout");
    const reason = isTimeout
      ? "Sanctions screening service timed out"
      : "Sanctions screening service unavailable";

    const unknownResult: SanctionsDetail = {
      status: "UNKNOWN",
      unavailableReason: reason,
      screenedAt: executedAt,
    };

    return buildSanctionsResult(address, unknownResult, executedAt, Date.now() - startMs, "opensanctions");
  }
}

// ─── Domain Function Stub ─────────────────────────────────────────────────────
// INTEGRATION: Replace with import from lib/sanctions.ts

async function callSanctionsDomainFunction(address: string): Promise<SanctionsDetail> {
  // STUB: This represents calling the real lib/sanctions.ts screenAddress() function.
  // In the real implementation, this would query OpenSanctions or equivalent.
  //
  // IMPORTANT: This stub returns UNKNOWN to clearly indicate it is not implemented.
  // Never change this to return NO_MATCH without a real implementation.
  console.warn(
    `[STUB] check_sanctions_status called for ${address}. ` +
      "Integration required: replace with real lib/sanctions.ts call."
  );
  return {
    status: "UNKNOWN",
    unavailableReason: "Sanctions check not yet integrated — stub implementation",
    screenedAt: new Date().toISOString(),
  };
}

// ─── Result Builder ───────────────────────────────────────────────────────────

function buildSanctionsResult(
  address: string,
  detail: SanctionsDetail,
  executedAt: string,
  durationMs: number,
  source: string
): TraceToolResult {
  const evidenceRefs: EvidenceReference[] = [];

  if (detail.status === "MATCH") {
    for (const match of detail.matches ?? []) {
      evidenceRefs.push({
        id: `sanctions-${match.matchId}`,
        type: "sanctions_match",
        source,
        freshness: detail.screenedAt,
        data: {
          matchId: match.matchId,
          entityName: match.entityName,
          source: match.source,
          listName: match.listName,
          queryAddress: address,
          screenedAt: detail.screenedAt,
        },
      });
    }
  }

  return {
    callId: "",
    toolName: "check_sanctions_status",
    status: "success",
    output: {
      address,
      sanctionsStatus: detail.status,
      matches: detail.matches ?? [],
      source: detail.source ?? source,
      screenedAt: detail.screenedAt,
      // Always explicit: unavailableReason explains UNKNOWN status
      unavailableReason: detail.unavailableReason,
    },
    provenance: {
      toolName: "check_sanctions_status",
      executedAt,
      source,
      durationMs,
    },
    evidenceRefs,
  };
}
