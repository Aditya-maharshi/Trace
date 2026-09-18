/**
 * API Route: POST /api/cases/[id]/export
 *
 * SAR (Suspicious Activity Report) export pipeline.
 * Compiles the full case history, pinned evidence snapshots (not live re-fetched data),
 * risk score, and case metadata into a sanitized JSON payload.
 *
 * The export action itself is logged as a case_history entry for chain-of-custody.
 * An explicit allow-list controls which fields are included in the export.
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractVerifiedUserIdAsync } from '../../../../../lib/domains/auth/verifyJwt';
import { getCaseDetails } from '../../../../../lib/domains/cases/caseStore';
import { withApiVersionHeaders } from '../../../../../lib/domains/core/apiVersion';
import { getSupabaseAdmin } from '../../../../../lib/domains/core/auditLog';

/**
 * Explicit allow-list of fields for SAR export.
 * New fields must be intentionally added here — deny-list is unsafe.
 */
const CASE_EXPORT_FIELDS = [
  'id', 'org_id', 'title', 'description', 'status', 'wallets',
  'jurisdiction', 'risk_score', 'entered_current_state_at',
  'sla_status', 'reason_for_transition', 'created_at', 'updated_at',
  'sla_threshold_hours', 'time_in_state_hours', 'is_sla_breaching',
] as const;

const HISTORY_EXPORT_FIELDS = [
  'id', 'case_id', 'from_state', 'to_state', 'actor_id',
  'actor_type', 'reason', 'metadata', 'created_at',
] as const;

const EVIDENCE_EXPORT_FIELDS = [
  'id', 'case_id', 'evidence_type', 'lookup_id',
  'graph_payload_hash', 'subgraph_slice', 'pinned_by',
  'pinned_at', 'annotation',
] as const;

const WALLET_EXPORT_FIELDS = [
  'id', 'case_id', 'address', 'added_by', 'added_at', 'notes',
] as const;

function pick<T extends Record<string, any>>(obj: T, keys: readonly string[]): Partial<T> {
  const result: any = {};
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const authHeader = req.headers.get('authorization') || '';
  const userId = await extractVerifiedUserIdAsync(authHeader);

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const details = await getCaseDetails(params.id);
    if (!details) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    // Authorization: only the case owner, analyst, or system cases (user_id=null) can export
    const c = details.case;
    if (c.user_id !== null && c.user_id !== userId && c.analyst_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Build sanitized SAR payload using allow-list
    const sarPayload = {
      export_version: '1.0.0',
      exported_at: new Date().toISOString(),
      exported_by: userId,
      case: pick(c, CASE_EXPORT_FIELDS),
      history: details.history.map((h) => pick(h, HISTORY_EXPORT_FIELDS)),
      evidence: details.evidence.map((e) => pick(e, EVIDENCE_EXPORT_FIELDS)),
      wallets: details.wallets.map((w) => pick(w, WALLET_EXPORT_FIELDS)),
      risk_assessment: {
        risk_score: c.risk_score,
        sla_status: c.sla_status,
        time_in_state_hours: c.time_in_state_hours,
        is_sla_breaching: c.is_sla_breaching,
      },
    };

    // Log the export action itself in case_history for chain-of-custody
    const client = getSupabaseAdmin();
    if (client) {
      await client.from('case_history').insert({
        case_id: params.id,
        from_state: c.status,
        to_state: c.status, // State unchanged — this is a data export, not a transition
        actor_id: userId,
        actor_type: 'human',
        reason: 'SAR payload exported',
        metadata: {
          export_format: 'json',
          evidence_count: details.evidence.length,
          history_count: details.history.length,
          wallet_count: details.wallets.length,
        },
        created_at: sarPayload.exported_at,
      });
    }

    return NextResponse.json(sarPayload, {
      status: 200,
      headers: {
        ...withApiVersionHeaders({}),
        'Content-Disposition': `attachment; filename="sar_case_${params.id}.json"`,
      },
    });
  } catch (err: any) {
    console.error(`[POST /api/cases/${params.id}/export] Error:`, err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
