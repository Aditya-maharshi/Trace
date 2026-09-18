import { getSupabaseAdmin } from "../core/auditLog";
import type { AttributionResponse, ScoredAttribution } from "../../../packages/shared-types";

export interface SahyogPayload {
  caseReference: string;
  targetAddress: string;
  attributedVasp: string;
  depositAddresses: string[];
  traceEvidenceHash: string;
  requestingUnit: string;
  timestamp: string;
}

export interface SahyogAdapter {
  dispatchRequest(payload: SahyogPayload): Promise<{
    status: 'TRANSMITTED' | 'PREPARED_NOT_TRANSMITTED' | 'FAILED';
    message: string;
    referenceId?: string;
  }>;
}

/**
 * Stub adapter for SAHYOG integration.
 * Complies with the requirement to operate in an explicit "prepared, not transmitted" mode
 * until real credentials exist. It queues the payload in the database.
 */
export class StubSahyogAdapter implements SahyogAdapter {
  async dispatchRequest(payload: SahyogPayload) {
    const admin = getSupabaseAdmin();
    if (!admin) {
      throw new Error("Database service unavailable for queueing SAHYOG payload");
    }

    // We abuse case_history to serve as our queue for the demo, 
    // tagging it with a specific actor_type so it can be queried as a queue list.
    const queueEntry = {
      case_id: payload.caseReference,
      from_state: null,
      to_state: 'investigating',
      actor_id: 'sahyog_stub',
      actor_type: 'SAHYOG_QUEUE',
      reason: 'SAHYOG Payload Prepared (Not Transmitted)',
      metadata: payload,
    };

    const { data, error } = await admin.from("case_history").insert(queueEntry).select('id').single();

    if (error) {
      throw new Error(`Failed to queue SAHYOG payload: ${error.message}`);
    }

    return {
      status: 'PREPARED_NOT_TRANSMITTED' as const,
      message: 'Payload generated and queued. Awaiting real SAHYOG portal credentials.',
      referenceId: data.id,
    };
  }
}

/**
 * Helper to compile the payload from a trace result.
 */
export function compileSahyogPayload(data: AttributionResponse, caseId: string, traceEvidenceHash: string): SahyogPayload {
  const depositAddresses = new Set<string>();
  data.paths.forEach((p: ScoredAttribution) => {
    if (p.path && p.path.length > 0) {
      const dest = p.path[p.path.length - 1];
      if (dest.toLowerCase() === data.nearestVasp?.toLowerCase()) {
        depositAddresses.add(dest);
      }
    }
  });
  if (depositAddresses.size === 0 && data.nearestVasp) {
    depositAddresses.add(data.nearestVasp);
  }

  return {
    caseReference: caseId,
    targetAddress: data.wallet,
    attributedVasp: data.nearestVaspLabel || data.nearestVasp || "Unknown VASP",
    depositAddresses: Array.from(depositAddresses),
    traceEvidenceHash,
    requestingUnit: "Cyber Crime Investigation Unit", // Hardcoded for demo
    timestamp: new Date().toISOString(),
  };
}
