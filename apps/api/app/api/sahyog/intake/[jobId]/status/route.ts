/**
 * app/api/sahyog/intake/[jobId]/status/route.ts
 *
 * GET /api/sahyog/intake/{jobId}/status
 *
 * Polls the status of a SAHYOG intake trace job.
 *
 * ### Response
 * {
 *   jobId: string,
 *   caseReference: string,
 *   status: "pending" | "tracing" | "attributed" | "failed",
 *   chain: string,
 *   wallets: string[],
 *   sahyogStatus: "not_compiled" | "prepared" | "transmitted",
 *   errorMessage?: string,
 *   createdAt: string,
 *   updatedAt: string,
 *   // Only present when status === "attributed":
 *   nearestVasp?: string,
 *   nearestVaspLabel?: string,
 *   hops?: number,
 *   risk?: string,
 *   confidence?: string,
 *   confirmUrl?: string,   // URL to call to transmit to SAHYOG
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../../../lib/domains/core/auditLog";

export async function GET(
  _request: NextRequest,
  { params }: { params: { jobId: string } },
) {
  const { jobId } = params;

  if (!jobId || !/^[0-9a-f-]{36}$/.test(jobId)) {
    return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
  }

  const client = getSupabaseAdmin();
  if (!client) {
    return NextResponse.json({ error: "Database service unavailable" }, { status: 503 });
  }

  const { data: job, error } = await client
    .from("sahyog_trace_jobs")
    .select(
      "id, case_reference, status, chain, wallets, sahyog_status, error_message, created_at, updated_at, attribution_result"
    )
    .eq("id", jobId)
    .single();

  if (error || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const attr = job.attribution_result as any;

  return NextResponse.json({
    jobId: job.id,
    caseReference: job.case_reference,
    status: job.status,
    chain: job.chain,
    wallets: job.wallets,
    sahyogStatus: job.sahyog_status,
    errorMessage: job.error_message ?? undefined,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
    ...(job.status === "attributed" && attr
      ? {
          nearestVasp: attr.nearestVasp ?? null,
          nearestVaspLabel: attr.nearestVaspLabel ?? null,
          hops: attr.hops ?? null,
          risk: attr.risk ?? null,
          confidence: attr.confidence ?? null,
          score: attr.score ?? null,
          confirmUrl: `/api/sahyog/${jobId}/confirm`,
          documentsUrl: `/api/report/${jobId}`,
        }
      : {}),
  });
}
