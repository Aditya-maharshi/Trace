/**
 * lib/traceAI/citations/parser.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Incremental citation marker parser.
 *
 * INVARIANT: The FRONTEND does NOT parse raw model output for citations.
 *   The server does it here, validates against the registry, and emits
 *   structured CitationEvent objects.
 *
 * INVARIANT: Unknown or fabricated citation IDs are REJECTED, not passed through.
 *   A model-generated citation that doesn't map to real evidence is stripped.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Citation, AttributionResult, TraceToolResult } from "../types";
import {
  CITATION_MARKER_REGEX,
  MAX_CITATIONS_PER_RESPONSE,
} from "./types";
import type { CitationRegistry } from "./types";
import { buildCitationRegistry } from "./resolver";

export interface ParsedCitation {
  marker: string;       // The raw marker text [[cite:abc123]]
  citation: Citation;   // The resolved, validated Citation
  startIndex: number;   // Position in the text
  endIndex: number;
}

export interface ParseResult {
  /** Prose with citation markers replaced by numbered references [1], [2], etc. */
  cleanText: string;
  /** Ordered list of resolved citations */
  citations: Citation[];
  /** Count of markers found but rejected (for audit) */
  rejectedCount: number;
}

/**
 * Parse a complete LLM response text, resolving all citation markers.
 * Returns clean prose with [N] references and an ordered citation list.
 */
export function parseCitations(
  rawText: string,
  registry: CitationRegistry
): ParseResult {
  const resolvedCitations: Citation[] = [];
  const seenIds = new Set<string>();
  let rejectedCount = 0;
  let citationIndex = 1;

  // Reset regex state
  CITATION_MARKER_REGEX.lastIndex = 0;

  const replacements: Array<{
    start: number;
    end: number;
    replacement: string;
  }> = [];

  let match: RegExpExecArray | null;
  const regex = new RegExp(CITATION_MARKER_REGEX.source, "g");

  while ((match = regex.exec(rawText)) !== null) {
    const [fullMatch, citeId, pathStr, hopStr] = match;
    const start = match.index;
    const end = start + fullMatch.length;

    if (resolvedCitations.length >= MAX_CITATIONS_PER_RESPONSE) {
      // Strip excess citations
      replacements.push({ start, end, replacement: "" });
      rejectedCount++;
      continue;
    }

    let resolved: Citation | null = null;

    if (citeId) {
      // New format: [[cite:abc123]]
      resolved = registry.citations.get(citeId) ?? null;
    } else if (pathStr !== undefined && hopStr !== undefined) {
      // Legacy format: [[path:0,hop:2]]
      const pathIndex = parseInt(pathStr, 10);
      const hopIndex = parseInt(hopStr, 10);
      resolved = resolvePathHopCitation(registry, pathIndex, hopIndex);
    }

    if (!resolved) {
      // INVARIANT: Unknown/fabricated citations are REJECTED
      replacements.push({ start, end, replacement: "" });
      rejectedCount++;
      continue;
    }

    // Deduplicate by citation ID
    if (seenIds.has(resolved.id)) {
      // Reuse the existing number
      const existingIndex = resolvedCitations.findIndex((c) => c.id === resolved!.id);
      replacements.push({ start, end, replacement: `[${existingIndex + 1}]` });
      continue;
    }

    seenIds.add(resolved.id);
    resolvedCitations.push(resolved);
    replacements.push({ start, end, replacement: `[${citationIndex}]` });
    citationIndex++;
  }

  // Apply replacements in reverse order to preserve indices
  let cleanText = rawText;
  for (const rep of [...replacements].reverse()) {
    cleanText = cleanText.slice(0, rep.start) + rep.replacement + cleanText.slice(rep.end);
  }

  return {
    cleanText: cleanText,
    citations: resolvedCitations,
    rejectedCount,
  };
}

/**
 * Build a CitationRegistry from an attribution result and tool outputs.
 * This is called BEFORE the LLM generates its response, so the registry
 * contains only real evidence — never anything the LLM invented.
 */
export function buildRegistry(params: {
  attributionResult?: AttributionResult;
  toolResults?: TraceToolResult[];
}): CitationRegistry {
  return buildCitationRegistry(params);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolvePathHopCitation(
  registry: CitationRegistry,
  pathIndex: number,
  hopIndex: number
): Citation | null {
  const result = registry.sourceData.attributionResult;
  if (!result) return null;

  const path = result.paths[pathIndex];
  if (!path) return null;

  const hop = path.hops[hopIndex];
  if (!hop) return null;

  // Build a citation ID for this path+hop
  const id = `path-${pathIndex}-hop-${hopIndex}`;

  // Return existing if already in registry
  if (registry.citations.has(id)) {
    return registry.citations.get(id)!;
  }

  // Build it dynamically for legacy markers
  const citation: Citation = {
    type: "path_hop",
    id,
    pathIndex,
    hopIndex,
    address: hop.address,
    transactionHash: hop.transactionHash,
    asset: hop.asset,
    value: hop.value,
    timestamp: hop.timestamp,
  };

  registry.citations.set(id, citation);
  return citation;
}

/**
 * Streaming-compatible incremental parser.
 * Buffers incomplete citation markers across token boundaries.
 */
export class StreamingCitationParser {
  private buffer = "";
  private registry: CitationRegistry;
  private citationCount = 0;

  constructor(registry: CitationRegistry) {
    this.registry = registry;
  }

  /**
   * Process a new token chunk.
   * Returns the clean text to emit and any completed citations found.
   */
  processChunk(chunk: string): {
    textToEmit: string;
    citations: ParsedCitation[];
  } {
    this.buffer += chunk;
    const citations: ParsedCitation[] = [];

    // Only process the buffer if we see a complete marker or are not inside one
    const openBracketIdx = this.buffer.lastIndexOf("[[");
    const closeBracketIdx = this.buffer.lastIndexOf("]]");

    let safeToProcess = this.buffer;
    let remainder = "";

    if (openBracketIdx > closeBracketIdx) {
      // Partial marker in progress — hold the tail
      safeToProcess = this.buffer.slice(0, openBracketIdx);
      remainder = this.buffer.slice(openBracketIdx);
    }

    // Parse complete markers from safe portion
    const result = parseCitations(safeToProcess, this.registry);
    this.buffer = remainder;

    return {
      textToEmit: result.cleanText,
      citations: [], // Full citation objects returned separately
    };
  }

  /** Flush remaining buffer at end of stream */
  flush(): { textToEmit: string; citations: ParsedCitation[] } {
    const result = parseCitations(this.buffer, this.registry);
    this.buffer = "";
    return { textToEmit: result.cleanText, citations: [] };
  }
}
