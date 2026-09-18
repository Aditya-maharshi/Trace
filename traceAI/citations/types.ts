/**
 * lib/traceAI/citations/types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Re-exports citation types and defines citation registry structure.
 * The Citation type is defined in types.ts — this adds registry mechanics.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type { Citation, CitationLocator } from "../types";

/**
 * A citation registry holds all citations built from real authoritative data
 * during a single Trace AI request. The LLM emits markers like [[cite:abc123]]
 * which are resolved against this registry — never fabricated by the LLM.
 */
export interface CitationRegistry {
  /** Map of citation ID → Citation */
  citations: Map<string, import("../types").Citation>;
  /** The original authoritative data from which citations were built */
  sourceData: {
    attributionResult?: import("../types").AttributionResult;
    toolResults?: import("../types").TraceToolResult[];
  };
}

/**
 * Citation marker formats we support:
 *  - New format:     [[cite:abc123]]
 *  - Legacy format:  [[path:0,hop:2]]  (backward-compatible)
 *
 * Both formats are parsed and resolved server-side.
 * The frontend never receives raw markers — only structured Citation objects.
 */
export const CITATION_MARKER_REGEX = /\[\[(?:cite:([a-zA-Z0-9_-]+)|path:(\d+),hop:(\d+))\]\]/g;

/** Maximum number of citations allowed per response (prevent abuse) */
export const MAX_CITATIONS_PER_RESPONSE = 20;
