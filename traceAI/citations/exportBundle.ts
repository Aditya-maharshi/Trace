/**
 * lib/traceAI/citations/exportBundle.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Builds a one-click audit-ready evidence export from a set of citations.
 *
 * INVARIANT: Only server-validated citations are exported.
 * The LLM narrative text is exported as "AI Explanation" and is clearly
 * separated from the authoritative engine evidence.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Citation } from "../types";
import { formatCitation } from "./formatter";

// ─── Export Types ─────────────────────────────────────────────────────────────

export interface EvidenceExportMetadata {
  requestId: string;
  exportedAt: string;
  walletAddress?: string;
  nearestVasp?: string;
  /** The AI-generated narrative — clearly separated from evidence */
  aiNarrative?: string;
  traceVersion?: string;
}

export interface EvidenceExportBundle {
  _schema: "trace-evidence-export-v1";
  metadata: EvidenceExportMetadata;
  citations: ExportedCitation[];
  /** Plain-text summary for non-technical readers */
  plainTextSummary: string;
}

export interface ExportedCitation {
  index: number;
  id: string;
  type: Citation["type"];
  label: string;
  sublabel?: string;
  /** All raw fields from the server-validated citation */
  data: Record<string, unknown>;
}

// ─── Builder ──────────────────────────────────────────────────────────────────

export function buildEvidenceExport(
  citations: Citation[],
  metadata: EvidenceExportMetadata
): EvidenceExportBundle {
  const exportedCitations: ExportedCitation[] = citations.map((citation, i) => {
    const formatted = formatCitation(citation);
    return {
      index: i + 1,
      id: citation.id,
      type: citation.type,
      label: formatted.label,
      sublabel: formatted.sublabel,
      data: citation as unknown as Record<string, unknown>,
    };
  });

  const plainTextSummary = buildPlainTextSummary(exportedCitations, metadata);

  return {
    _schema: "trace-evidence-export-v1",
    metadata,
    citations: exportedCitations,
    plainTextSummary,
  };
}

// ─── Plain Text Formatter ─────────────────────────────────────────────────────

function buildPlainTextSummary(
  citations: ExportedCitation[],
  meta: EvidenceExportMetadata
): string {
  const lines: string[] = [
    "TRACE EVIDENCE EXPORT",
    "=====================",
    `Request ID   : ${meta.requestId}`,
    `Exported At  : ${meta.exportedAt}`,
    meta.walletAddress ? `Wallet       : ${meta.walletAddress}` : "",
    meta.nearestVasp   ? `Nearest VASP : ${meta.nearestVasp}` : "",
    meta.traceVersion  ? `Engine Ver.  : ${meta.traceVersion}` : "",
    "",
    `EVIDENCE SOURCES (${citations.length})`,
    "─────────────────────────────────────",
    ...citations.map((c) =>
      `[${c.index}] ${c.label}${c.sublabel ? ` · ${c.sublabel}` : ""} (${c.type})`
    ),
    "",
  ];

  if (meta.aiNarrative) {
    lines.push(
      "AI EXPLANATION (for context only — not authoritative evidence)",
      "──────────────────────────────────────────────────────────────",
      meta.aiNarrative,
      ""
    );
  }

  lines.push(
    "IMPORTANT: Attribution scores, confidence levels, risk levels, VASP labels,",
    "and sanctions results are computed by the Trace deterministic engine.",
    "The AI explanation above is interpretive context only.",
  );

  return lines.filter((l) => l !== undefined).join("\n");
}

// ─── Download Helpers ─────────────────────────────────────────────────────────

/** Trigger a browser download of the JSON bundle */
export function downloadBundleAsJson(bundle: EvidenceExportBundle): void {
  const json = JSON.stringify(bundle, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `trace-evidence-${bundle.metadata.requestId}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Trigger a browser download of the plain-text report */
export function downloadBundleAsText(bundle: EvidenceExportBundle): void {
  const blob = new Blob([bundle.plainTextSummary], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `trace-evidence-${bundle.metadata.requestId}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}
