/**
 * lib/traceAI/templates/sarTemplate.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * FinCEN SAR Form 111 template builder.
 *
 * INVARIANT: All pre-filled values come ONLY from the deterministic AttributionResult.
 * The AI fills narrative fields only. It cannot overwrite deterministic fields.
 * All output is watermarked DRAFT and requires human review before submission.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { AttributionResult } from "../types";

// ─── SAR Field Types ──────────────────────────────────────────────────────────

export interface SARDraft {
  _watermark: "DRAFT — NOT FOR SUBMISSION — REQUIRES HUMAN REVIEW AND SIGN-OFF";
  _generatedAt: string;
  _traceRequestId: string;

  /** Part I: Filing Institution */
  filingInstitution: {
    name: string;         // Must be filled by analyst
    tin: string;          // Must be filled by analyst
    address: string;      // Must be filled by analyst
    contactName: string;  // Must be filled by analyst
    contactPhone: string; // Must be filled by analyst
  };

  /** Part II: Suspicious Activity — pre-filled where possible */
  suspiciousActivity: {
    dateRangeFrom: string;
    dateRangeTo: string;
    totalAmount: string;
    instruments: string[];
    activityTypes: string[];
    walletAddress: string;
    chain: string;
  };

  /** Part III: Subject */
  subject: {
    walletAddress: string;
    nearestVasp: string;
    sanctionsStatus: string;
    riskLevel: string;
    ensName: string | null;
    mixerExposure: string;
    structuringSignal: boolean;
  };

  /** Part IV: Narrative — AI-generated, must be reviewed */
  narrative: {
    aiGeneratedDraft: string;   // TraceAI output
    analystNotes: string;       // "[ANALYST REVIEW REQUIRED]"
  };

  /** Validation warnings */
  validationWarnings: string[];
}

// ─── Builder ──────────────────────────────────────────────────────────────────

export function buildSARTemplate(
  result: AttributionResult,
  requestId: string
): Omit<SARDraft, "narrative"> & { narrative: { aiGeneratedDraft: string; analystNotes: string } } {
  const warnings: string[] = [];

  // Determine activity types from signals
  const activityTypes: string[] = [];
  if (result.mixerExposure?.detected) activityTypes.push("Layering — mixer/tumbler use");
  if (result.structuringSignalDetected) activityTypes.push("Structuring");
  if (result.traceExitedToBridge) activityTypes.push("Cross-chain transfer (bridge exit)");
  if (result.sanctionsDetail?.status === "MATCH") activityTypes.push("Potential OFAC SDN match");
  if (activityTypes.length === 0) activityTypes.push("[ANALYST REVIEW REQUIRED — specify activity type]");

  // Sanctions warnings
  if (result.sanctionsDetail?.status === "UNKNOWN") {
    warnings.push("SANCTIONS STATUS UNKNOWN: Screening was not completed. Analyst must re-run sanctions check before submission.");
  }
  if (result.sanctionsDetail?.status === "MATCH") {
    warnings.push("SANCTIONS MATCH DETECTED: This case may require immediate escalation and blocking action before filing.");
  }
  if (result.confidence === "Low" || result.confidence === "None") {
    warnings.push(`LOW CONFIDENCE ATTRIBUTION (${result.confidence}): Analyst must verify VASP attribution before including in the SAR.`);
  }
  if (result.traceExitedToBridge) {
    warnings.push("BRIDGE EXIT: Trace ends at a bridge contract. Destination-chain funds have not been attributed. Narrative must reflect this limitation.");
  }

  // Total amount from paths
  const totalUSD = result.paths?.reduce((sum, p) => sum + (p.totalValueUSD ?? 0), 0) ?? 0;

  // First asset seen
  const assets = result.assetsInvolved?.map((a) => a.symbol) ?? ["[ANALYST REVIEW REQUIRED]"];

  return {
    _watermark: "DRAFT — NOT FOR SUBMISSION — REQUIRES HUMAN REVIEW AND SIGN-OFF",
    _generatedAt: new Date().toISOString(),
    _traceRequestId: requestId,

    filingInstitution: {
      name: "[ANALYST REVIEW REQUIRED]",
      tin: "[ANALYST REVIEW REQUIRED]",
      address: "[ANALYST REVIEW REQUIRED]",
      contactName: "[ANALYST REVIEW REQUIRED]",
      contactPhone: "[ANALYST REVIEW REQUIRED]",
    },

    suspiciousActivity: {
      dateRangeFrom: result.paths?.[0]?.hops?.[0]?.timestamp ?? "[ANALYST REVIEW REQUIRED]",
      dateRangeTo: result.computedAt,
      totalAmount: totalUSD > 0 ? `$${totalUSD.toLocaleString()} USD (estimated)` : "[ANALYST REVIEW REQUIRED]",
      instruments: assets,
      activityTypes,
      walletAddress: result.address,
      chain: "[ANALYST REVIEW REQUIRED — specify chain]",
    },

    subject: {
      walletAddress: result.address,
      nearestVasp: result.nearestVasp ?? "Unknown",
      sanctionsStatus: result.sanctionsDetail?.status ?? "NOT CHECKED",
      riskLevel: result.risk,
      ensName: result.ensNames?.[result.address] ?? null,
      mixerExposure: result.mixerExposure?.detected
        ? `Detected — ${result.mixerExposure.exposure ? Math.round(result.mixerExposure.exposure * 100) + "% taint" : "extent unknown"}`
        : "None detected",
      structuringSignal: result.structuringSignalDetected ?? false,
    },

    narrative: {
      aiGeneratedDraft: "", // Will be filled by the AI call
      analystNotes: "[ANALYST REVIEW REQUIRED — review and expand AI draft before submission]",
    },

    validationWarnings: warnings,
  };
}

/** Build the prompt to send to the AI for the SAR narrative field */
export function buildSARNarrativePrompt(result: AttributionResult, template: ReturnType<typeof buildSARTemplate>): string {
  return `Generate the SAR Part IV Narrative for this blockchain investigation.

Investigation data:
- Wallet: ${result.address}
- Nearest VASP: ${result.nearestVasp ?? "Unknown"}
- Confidence: ${result.confidence}
- Risk: ${result.risk}
- Sanctions: ${result.sanctionsDetail?.status ?? "Not checked"}
- Mixer exposure: ${template.subject.mixerExposure}
- Structuring signal: ${result.structuringSignalDetected ? "Yes" : "No"}
- Bridge exit: ${result.traceExitedToBridge ? "Yes — cross-chain attribution not established" : "No"}
- Activity types: ${template.suspiciousActivity.activityTypes.join("; ")}
- Total amount: ${template.suspiciousActivity.totalAmount}

Write a factual SAR Part IV narrative of 3-5 sentences. Use formal regulatory language.
Start with "The filing institution identified suspicious activity..." 
Do NOT invent transaction details not in the evidence above.
End with: "This report has been prepared as a draft and requires human review, verification, and sign-off before submission."`;
}
