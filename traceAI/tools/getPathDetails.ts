/**
 * lib/traceAI/tools/getPathDetails.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tool: get_path_details
 *
 * INVARIANT: This handler is thin. It validates, reads from authoritative
 * context, and normalizes. It does NOT duplicate path-scoring logic.
 *
 * INVARIANT: The response is sourced from the stored/authoritative Trace data,
 * NOT from re-running the scoring engine.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { z } from "zod";
import type { TraceToolResult, EvidenceReference } from "../types";
import type { ToolExecutionContext } from "./registry";
import { buildExplorerUrl } from "../citations/resolver";

const InputSchema = z.object({
  pathIndex: z.number().int().min(0),
});

export async function executeGetPathDetails(
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
      toolName: "get_path_details",
      status: "validation_failed",
      output: null,
      provenance: {
        toolName: "get_path_details",
        executedAt,
        source: "trace_engine",
        durationMs: 0,
      },
      error: {
        code: "VALIDATION_FAILED",
        message: parseResult.error.message,
        userMessage: `Invalid path index. Please provide a non-negative integer.`,
      },
    };
  }

  const { pathIndex } = parseResult.data;

  // ── Authorization: must have attribution result in context ────────────────
  if (!context.attributionResult) {
    return {
      callId: "",
      toolName: "get_path_details",
      status: "error",
      output: null,
      provenance: {
        toolName: "get_path_details",
        executedAt,
        source: "trace_engine",
        durationMs: Date.now() - startMs,
      },
      error: {
        code: "NO_ATTRIBUTION_CONTEXT",
        message: "No attribution result in execution context",
        userMessage: "Path details are not available — no attribution result loaded.",
      },
    };
  }

  // ── Resolve Path ──────────────────────────────────────────────────────────
  const path = context.attributionResult.paths[pathIndex];
  if (!path) {
    return {
      callId: "",
      toolName: "get_path_details",
      status: "error",
      output: null,
      provenance: {
        toolName: "get_path_details",
        executedAt,
        source: "trace_engine",
        durationMs: Date.now() - startMs,
      },
      error: {
        code: "PATH_NOT_FOUND",
        message: `Path at index ${pathIndex} not found (result has ${context.attributionResult.paths.length} paths)`,
        userMessage: `Path ${pathIndex} does not exist in the current attribution result.`,
      },
    };
  }

  // ── Build Structured Output ───────────────────────────────────────────────
  const hops = path.hops.map((hop) => ({
    hopIndex: hop.hopIndex,
    address: hop.address,
    from: hop.from,
    to: hop.to,
    transactionHash: hop.transactionHash,
    asset: hop.asset,
    value: hop.value,
    valueUSD: hop.valueUSD,
    timestamp: hop.timestamp,
    blockNumber: hop.blockNumber,
    isMixer: hop.isMixer ?? false,
    isBridge: hop.isBridge ?? false,
    isSanctioned: hop.isSanctioned ?? false,
    // Trusted explorer URL — generated here, NOT by LLM
    explorerUrl: hop.transactionHash
      ? buildExplorerUrl("ethereum", hop.transactionHash)
      : undefined,
  }));

  const output = {
    pathIndex: path.pathIndex,
    vasp: path.vasp,
    score: path.score,
    hops,
    totalValueUSD: path.totalValueUSD,
    daysSinceLastTx: path.daysSinceLastTx,
    hopCount: path.hops.length,
  };

  // ── Build Evidence References ─────────────────────────────────────────────
  const evidenceRefs: EvidenceReference[] = path.hops.map((hop) => ({
    id: `path-${pathIndex}-hop-${hop.hopIndex}`,
    type: "path_hop",
    source: "trace_engine",
    freshness: context.attributionResult!.computedAt,
    locator: {
      target: {
        type: "graph_hop" as const,
        pathIndex,
        hopIndex: hop.hopIndex,
      },
    },
    data: {
      pathIndex,
      hopIndex: hop.hopIndex,
      address: hop.address,
      txHash: hop.transactionHash,
      asset: hop.asset,
      value: hop.value,
    },
  }));

  return {
    callId: "",
    toolName: "get_path_details",
    status: "success",
    output,
    provenance: {
      toolName: "get_path_details",
      executedAt,
      source: "trace_engine",
      sourceVersion: context.attributionResult.traceVersion,
      freshness: context.attributionResult.computedAt,
      durationMs: Date.now() - startMs,
    },
    evidenceRefs,
  };
}
