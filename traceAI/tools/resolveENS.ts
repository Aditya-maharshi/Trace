/**
 * lib/traceAI/tools/resolveENS.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tool: resolve_ens
 *
 * INVARIANT: Distinguishes "no ENS name found" from "resolver unavailable".
 *   not_found = real lookup completed, no name registered
 *   unavailable = could not reach ENS resolver (don't claim either result)
 *
 * INTEGRATION NOTE:
 *   Replace the stub with your project's lib/etherscan.ts or equivalent.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { z } from "zod";
import type { TraceToolResult, EvidenceReference } from "../types";
import type { ToolExecutionContext } from "./registry";

const InputSchema = z.object({
  address: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, "Must be a valid Ethereum address"),
});

export type ENSResult =
  | { status: "found"; ensName: string; resolvedAt: string; source: string }
  | { status: "not_found"; checkedAt: string }
  | { status: "unavailable"; reason: string };

export async function executeResolveENS(
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
      toolName: "resolve_ens",
      status: "validation_failed",
      output: null,
      provenance: {
        toolName: "resolve_ens",
        executedAt,
        source: "ens_resolver",
        durationMs: 0,
      },
      error: {
        code: "INVALID_ADDRESS",
        message: parseResult.error.message,
        userMessage: "Invalid Ethereum address format.",
      },
    };
  }

  const { address } = parseResult.data;

  // ── Check existing result cache first ────────────────────────────────────
  const normalizedAddress = address.toLowerCase();
  const existingENS =
    context.attributionResult?.ensNames?.[address] ??
    context.attributionResult?.ensNames?.[normalizedAddress];
  if (existingENS) {
    const ensResult: ENSResult = {
      status: "found",
      ensName: existingENS,
      resolvedAt: context.attributionResult!.computedAt,
      source: "trace_cache",
    };
    return buildENSResult(address, ensResult, executedAt, Date.now() - startMs);
  }

  // ── Call ENS domain function ──────────────────────────────────────────────
  // INTEGRATION: Replace with your project's ENS resolution function
  try {
    const result = await callENSDomainFunction(address);
    return buildENSResult(address, result, executedAt, Date.now() - startMs);
  } catch (err: unknown) {
    const isTimeout = err instanceof Error && err.message.includes("timeout");
    const result: ENSResult = {
      status: "unavailable",
      reason: isTimeout ? "ENS resolver timed out" : "ENS resolver unavailable",
    };
    return buildENSResult(address, result, executedAt, Date.now() - startMs);
  }
}

// ─── Domain Function Stub ─────────────────────────────────────────────────────
// INTEGRATION: Replace with import from lib/etherscan.ts or lib/ens.ts

async function callENSDomainFunction(address: string): Promise<ENSResult> {
  console.warn(
    `[STUB] resolve_ens called for ${address}. ` +
      "Integration required: replace with real ENS resolution."
  );
  // Return not_found (not unavailable) to differentiate from an error
  return {
    status: "not_found",
    checkedAt: new Date().toISOString(),
  };
}

// ─── Result Builder ───────────────────────────────────────────────────────────

function buildENSResult(
  address: string,
  result: ENSResult,
  executedAt: string,
  durationMs: number
): TraceToolResult {
  const evidenceRefs: EvidenceReference[] = [];

  if (result.status === "found") {
    evidenceRefs.push({
      id: `ens-${address}`,
      type: "ens",
      source: result.source,
      freshness: result.resolvedAt,
      data: {
        address,
        ensName: result.ensName,
        resolvedAt: result.resolvedAt,
      },
    });
  }

  return {
    callId: "",
    toolName: "resolve_ens",
    status: "success",
    output: {
      address,
      ...result,
    },
    provenance: {
      toolName: "resolve_ens",
      executedAt,
      source: "ens_resolver",
      durationMs,
    },
    evidenceRefs,
  };
}
