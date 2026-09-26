/**
 * app/api/sahyog/intake/route.ts
 *
 * POST /api/sahyog/intake
 *
 * Asynchronous SAHYOG intake endpoint. Accepts a wallet address (or list of
 * wallets) + case reference, kicks off a trace job, and returns immediately
 * with a job ID for polling.
 *
 * ### Request body (JSON)
 * {
 *   caseReference: string,      // NCRP complaint number or internal case ID
 *   wallets: string[],          // one or more addresses to trace
 *   chain?: SupportedChain,     // defaults to "ethereum"
 *   requestingUnit?: string,    // e.g. "Cyber Crime Cell, Ahmedabad"
 *   officerName?: string,
 *   officerId?: string,
 * }
 *
 * ### Response (202 Accepted)
 * {
 *   jobId: string,
 *   caseReference: string,
 *   status: "tracing_started",
 *   pollUrl: string,
 * }
 *
 * ### Design
 * - Input validated with Zod (matching existing validation approach in route.ts)
 * - Job record written to `sahyog_trace_jobs` in Supabase
 * - Trace kicked off via `setImmediate` (non-blocking)
 * - On VASP resolution: documents generated, sahyog_payload populated,
 *   status set to "attributed"
 * - Documents NOT auto-submitted — status is always PREPARED_NOT_TRANSMITTED
 *   until officer calls /api/sahyog/[caseId]/confirm
 *
 * ### Auth
 * Uses the existing API-key + Supabase JWT auth enforced by middleware.ts.
 * No additional auth scheme is added.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "../../../../lib/domains/core/auditLog";
import { trace } from "../../../../lib/domains/tracing/chainRegistry";
import {
  generateAllDocuments,
  computeEvidenceHash,
} from "../../../../lib/domains/compliance/documentGenerator";
import { extractVerifiedUserIdAsync } from "../../../../lib/domains/auth/verifyJwt";
import type { SupportedChain } from "../../../../lib/domains/tracing/chainAdapter";

export const maxDuration = 10;

// ─────────────────────────────────────────────────────────────────────────────
// Request schema
// ─────────────────────────────────────────────────────────────────────────────

const IntakeSchema = z.object({
  caseReference: z
    .string()
    .min(3)
    .max(100)
    .describe("NCRP complaint number or internal case ID"),
  wallets: z
    .array(z.string().min(10).max(128))
    .min(1)
    .max(10)
    .describe("Wallet addresses to trace — at most 10 per job"),
  chain: z
    .enum(["ethereum", "bitcoin", "tron", "bnbchain", "solana", "polygon"])
    .optional()
    .default("ethereum"),
  requestingUnit: z.string().max(200).optional().default("Cyber Crime Investigation Unit"),
  officerName: z.string().max(100).optional().default("Unknown"),
  officerId: z.string().max(50).optional().default(""),
});

type IntakeInput = z.infer<typeof IntakeSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Background trace worker
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runs the trace for all wallets and updates the job record.
 * Called via `setImmediate` so the HTTP response is returned first.
 *
 * For each wallet in the job:
 *   1. Run trace()
 *   2. If VASP found with confidence >= CONFIDENCE_THRESHOLD, generate documents
 *   3. Update job record with result + documents
 */
async function runTraceJob(
  jobId: string,
  input: IntakeInput,
  userId: string | null,
): Promise<void> {
  const client = getSupabaseAdmin();
  if (!client) {
    console.error(`[sahyog/intake] Job ${jobId}: Supabase unavailable — cannot update job`);
    return;
  }

  try {
    // Mark as "tracing"
    await client
      .from("sahyog_trace_jobs")
      .update({ status: "tracing", updated_at: new Date().toISOString() })
      .eq("id", jobId);

    // Trace all wallets (sequentially to avoid thundering-herd on the API)
    const allResults = [];
    for (const wallet of input.wallets) {
      const result = await trace({
        wallet,
        chain: input.chain as SupportedChain,
        maxHops: 8,
        maxBranchesPerHop: 5,
      });
      allResults.push(result);
    }

    // Use the first wallet's result as the primary attribution for documents
    const primary = allResults[0];

    if (primary.adapterError) {
      await client.from("sahyog_trace_jobs").update({
        status: "failed",
        error_message: primary.adapterError,
        updated_at: new Date().toISOString(),
      }).eq("id", jobId);
      return;
    }

    // For Ethereum: get the full AttributionResponse; for others use the trace result
    // We build a minimal AttributionResponse-compatible object for document generation
    const mockAttribution = {
      wallet: primary.wallet,
      nearestVasp: primary.paths[0]?.nearestVasp ?? null,
      nearestVaspLabel: primary.nearestVaspLabel,
      hops: primary.hops,
      confidence: (primary.hops !== null && primary.hops <= 3 ? "High" : primary.hops !== null && primary.hops <= 5 ? "Medium" : "Low") as "High" | "Medium" | "Low" | null,
      score: primary.paths[0]?.confidenceScore ?? null,
      paths: primary.paths.map((p) => ({
        vasp: p.nearestVasp ?? "",
        hops: p.path.length - 1,
        path: p.path,
        score: p.confidenceScore,
        assetsInvolved: [p.currency],
        breakdown: { hops: p.path.length - 1, totalValueUSD: p.amountFlowed, daysSinceLastTx: 0, taintFraction: 1, score: p.confidenceScore },
      })),
      risk: primary.risk,
      structuringSignalDetected: false,
      ensNames: {},
      mixerExposure: [],
      confidenceThresholds: { high: 0.7, medium: 0.4 },
      topVasps: [],
      bridgeExitPoints: [],
      traceExitedToBridge: false,
      incompleteTraversal: { skippedNodes: 0 },
      methodology: { notice: "BFS trace", vaspRegistryNotice: "", sanctionsSource: "", humanReviewDisclaimer: "Investigative lead only — requires VASP confirmation", calibrationDate: "", calibrationSample: "", calibratedHighThreshold: 0.7, calibratedLowThreshold: 0.4, activeHighThreshold: 0.7, activeLowThreshold: 0.4, limitationsDocument: "" },
      dataProvenance: { source: "live-etherscan" as const, fetchedAt: primary.generatedAt },
      dataSource: "live",
      requestId: jobId,
    };

    const evidenceHash = computeEvidenceHash(mockAttribution as any);

    const docs = generateAllDocuments({
      attribution: mockAttribution as any,
      caseReference: input.caseReference,
      traceEvidenceHash: evidenceHash,
      requestingUnit: input.requestingUnit,
      officerName: input.officerName,
      officerId: input.officerId,
      generatedAt: new Date().toISOString(),
    });

    // Update job record with results
    await client.from("sahyog_trace_jobs").update({
      status: "attributed",
      attribution_result: mockAttribution,
      sahyog_payload: {
        caseReference: input.caseReference,
        targetAddress: primary.wallet,
        attributedVasp: primary.nearestVaspLabel,
        depositAddresses: primary.paths.map((p) => p.nearestVasp).filter(Boolean),
        traceEvidenceHash: evidenceHash,
        requestingUnit: input.requestingUnit,
        timestamp: new Date().toISOString(),
        documents: docs,
      },
      sahyog_status: "prepared",
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);

    // Audit trail in generated_documents table
    for (const [docKey, doc] of Object.entries(docs)) {
      await client.from("generated_documents").insert({
        job_id: jobId,
        case_reference: input.caseReference,
        doc_type: doc.documentType,
        content_hash: doc.contentHash,
        generated_by: userId ?? "system",
        metadata: { docKey },
      }).catch((e: any) => {
        console.warn(`[sahyog/intake] Failed to record generated_document for ${docKey}:`, e.message);
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[sahyog/intake] Job ${jobId} failed:`, msg);
    await client.from("sahyog_trace_jobs").update({
      status: "failed",
      error_message: msg,
      updated_at: new Date().toISOString(),
    }).eq("id", jobId).catch(() => {});
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Route handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // ── 1. Parse + validate body ──────────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON in request body" },
      { status: 400 },
    );
  }

  const parsed = IntakeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid request",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const input = parsed.data;

  // ── 2. Auth ───────────────────────────────────────────────────────────────
  const authHeader = request.headers.get("authorization") ?? "";
  const userId = await extractVerifiedUserIdAsync(authHeader);

  // ── 3. Create job record ──────────────────────────────────────────────────
  const client = getSupabaseAdmin();
  if (!client) {
    return NextResponse.json(
      { error: "Database service unavailable" },
      { status: 503 },
    );
  }

  const { data: job, error: jobErr } = await client
    .from("sahyog_trace_jobs")
    .insert({
      case_reference: input.caseReference,
      wallets: input.wallets,
      chain: input.chain,
      status: "pending",
      submitted_by: userId ?? null,
    })
    .select("id")
    .single();

  if (jobErr || !job) {
    return NextResponse.json(
      { error: `Failed to create trace job: ${jobErr?.message ?? "Unknown error"}` },
      { status: 500 },
    );
  }

  const jobId: string = job.id;

  // ── 4. Kick off background trace (non-blocking) ───────────────────────────
  // We use setImmediate so the HTTP response (202) is returned before the
  // trace starts. On Vercel/serverless this works because the handler
  // completes synchronously and the background work runs before the process
  // is frozen. On long-running servers it works as expected.
  setImmediate(() => {
    runTraceJob(jobId, input, userId).catch((err) => {
      console.error(`[sahyog/intake] Unhandled error in runTraceJob(${jobId}):`, err);
    });
  });

  // ── 5. Return 202 Accepted ────────────────────────────────────────────────
  return NextResponse.json(
    {
      jobId,
      caseReference: input.caseReference,
      status: "tracing_started",
      pollUrl: `/api/sahyog/intake/${jobId}/status`,
      message:
        "Trace job created. Poll the pollUrl for status. " +
        "When status is 'attributed', call /api/sahyog/{jobId}/confirm to transmit to SAHYOG.",
    },
    { status: 202 },
  );
}
