/**
 * app/api/sahyog/[caseId]/confirm/route.ts
 *
 * POST /api/sahyog/{caseId}/confirm
 *
 * Human-in-the-loop gate for SAHYOG freeze request transmission.
 *
 * ### Design rationale
 * The spec mandates that SAHYOG payloads are NEVER auto-transmitted.
 * The /api/sahyog/intake endpoint prepares the payload (status: PREPARED_NOT_TRANSMITTED).
 * This endpoint is the explicit officer confirmation step required before transmission.
 *
 * ### What this endpoint does
 * 1. Validates the job exists and is in "attributed" / sahyog_status "prepared" state
 * 2. Verifies the officer is authenticated
 * 3. Attempts transmission via the configured SahyogAdapter
 *    - Currently: StubSahyogAdapter (returns PREPARED_NOT_TRANSMITTED until real credentials)
 *    - When real credentials exist: LiveSahyogAdapter (implements the SahyogAdapter interface)
 * 4. Records the transmission attempt in case_history
 * 5. Returns the transmission result
 *
 * ### Auth
 * Requires a valid JWT (checked by middleware.ts). Unauthenticated callers
 * receive 401 — not 403 — so the error message doesn't reveal the endpoint exists.
 *
 * ### Error if job not in prepared state
 * Returns 403 if the job is not yet attributed or already transmitted.
 * This enforces the human-in-the-loop requirement: you cannot call confirm
 * on an incomplete trace.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../../lib/domains/core/auditLog";
import {
  StubSahyogAdapter,
  SahyogAdapter,
  compileSahyogPayload,
} from "../../../../../lib/domains/compliance/sahyogAdapter";
import { extractVerifiedUserIdAsync } from "../../../../../lib/domains/auth/verifyJwt";

export async function POST(
  request: NextRequest,
  { params }: { params: { caseId: string } },
) {
  const { caseId } = params;

  // ── 1. Validate job ID ───────────────────────────────────────────────────
  if (!caseId || !/^[0-9a-f-]{36}$/.test(caseId)) {
    return NextResponse.json({ error: "Invalid case ID" }, { status: 400 });
  }

  // ── 2. Auth — must be a verified JWT holder ──────────────────────────────
  const authHeader = request.headers.get("authorization") ?? "";
  const userId = await extractVerifiedUserIdAsync(authHeader);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── 3. Fetch job ─────────────────────────────────────────────────────────
  const client = getSupabaseAdmin();
  if (!client) {
    return NextResponse.json({ error: "Database service unavailable" }, { status: 503 });
  }

  const { data: job, error: fetchErr } = await client
    .from("sahyog_trace_jobs")
    .select("id, case_reference, status, sahyog_status, sahyog_payload, attribution_result, wallets")
    .eq("id", caseId)
    .single();

  if (fetchErr || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // ── 4. State guard — enforces human-in-the-loop requirement ─────────────
  if (job.status !== "attributed") {
    return NextResponse.json(
      {
        error: "Cannot confirm: trace job is not yet complete",
        currentStatus: job.status,
        message: "Call /api/sahyog/intake/{jobId}/status and wait for status: 'attributed' before confirming.",
      },
      { status: 403 },
    );
  }

  if (job.sahyog_status === "transmitted") {
    return NextResponse.json(
      {
        error: "This payload has already been transmitted",
        sahyogStatus: job.sahyog_status,
      },
      { status: 409 },
    );
  }

  // ── 5. Compile and dispatch SAHYOG payload ───────────────────────────────
  const attribution = job.attribution_result as any;
  const sahyogPayload = (job.sahyog_payload as any);

  // Prefer the pre-compiled payload if available, otherwise compile now
  const payloadToSubmit = sahyogPayload?.caseReference
    ? sahyogPayload
    : compileSahyogPayload(attribution, job.case_reference, attribution?.requestId ?? caseId);

  let transmissionResult;
  try {
    // Adapter selection: swap StubSahyogAdapter → LiveSahyogAdapter when
    // real SAHYOG portal credentials are available.
    const adapter: SahyogAdapter = new StubSahyogAdapter();
    transmissionResult = await adapter.dispatchRequest(payloadToSubmit);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `SAHYOG dispatch failed: ${msg}` },
      { status: 502 },
    );
  }

  // ── 6. Update job status ─────────────────────────────────────────────────
  const newSahyogStatus =
    transmissionResult.status === "TRANSMITTED" ? "transmitted" : "prepared";

  await client
    .from("sahyog_trace_jobs")
    .update({
      sahyog_status: newSahyogStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", caseId);

  // ── 7. Record in case_history (if a matching case exists) ─────────────────
  await client
    .from("case_history")
    .insert({
      case_id: job.case_reference,
      from_state: null,
      to_state: "investigating",
      actor_id: userId,
      actor_type: "human",
      reason: `SAHYOG payload confirmed by officer ${userId}. Transmission status: ${transmissionResult.status}.`,
      metadata: {
        jobId: caseId,
        transmissionStatus: transmissionResult.status,
        referenceId: transmissionResult.referenceId,
        sahyogPayloadHash: sahyogPayload?.contentHash,
      },
    }); // Non-fatal — case may not exist in case_history

  return NextResponse.json({
    jobId: caseId,
    caseReference: job.case_reference,
    transmissionStatus: transmissionResult.status,
    transmissionMessage: transmissionResult.message,
    referenceId: transmissionResult.referenceId,
    confirmedBy: userId,
    confirmedAt: new Date().toISOString(),
    note:
      transmissionResult.status === "PREPARED_NOT_TRANSMITTED"
        ? "Payload is queued. Real SAHYOG portal credentials are not yet configured. " +
          "When credentials are set (SAHYOG_API_KEY + SAHYOG_PORTAL_URL), implement " +
          "LiveSahyogAdapter and replace StubSahyogAdapter in this route."
        : undefined,
  });
}
