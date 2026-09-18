/**
 * lib/traceAI/citations/formatter.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Converts Citation objects → human-readable labels + UI locators.
 * Used by the frontend to render citation chips and handle click navigation.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Citation, CitationLocator } from "../types";

export interface FormattedCitation {
  id: string;
  label: string;           // e.g. "Path 0 → Hop 2"
  sublabel?: string;       // e.g. "0xabc... → 0xdef..."
  icon: CitationIcon;
  locator: CitationLocator;
  externalUrl?: string;    // Explorer link (trusted, server-generated)
}

export type CitationIcon =
  | "path"
  | "transaction"
  | "sanctions"
  | "vasp"
  | "bridge"
  | "ens"
  | "methodology";

/**
 * Format a Citation into a UI-ready representation.
 * All fields here come from the validated server-side Citation — never the LLM.
 */
export function formatCitation(citation: Citation): FormattedCitation {
  switch (citation.type) {
    case "path_hop":
      return {
        id: citation.id,
        label: `Path ${citation.pathIndex} → Hop ${citation.hopIndex}`,
        sublabel: citation.address
          ? `${truncateAddress(citation.address)}`
          : undefined,
        icon: "path",
        locator: {
          target: {
            type: "graph_hop",
            pathIndex: citation.pathIndex,
            hopIndex: citation.hopIndex,
          },
        },
        externalUrl: citation.transactionHash
          ? undefined // Explorer URL is on the transaction citation, not hop
          : undefined,
      };

    case "transaction":
      return {
        id: citation.id,
        label: `Tx ${truncateHash(citation.txHash)}`,
        sublabel: citation.chain,
        icon: "transaction",
        locator: {
          target: {
            type: "transaction",
            chain: citation.chain,
            txHash: citation.txHash,
          },
        },
        externalUrl: citation.explorerUrl,
      };

    case "sanctions_match":
      return {
        id: citation.id,
        label: `Sanctions: ${citation.entityName ?? citation.matchId}`,
        sublabel: citation.source,
        icon: "sanctions",
        locator: {
          target: {
            type: "sanctions_panel",
            matchId: citation.matchId,
          },
        },
      };

    case "vasp_label":
      return {
        id: citation.id,
        label: `VASP: ${citation.vaspName}`,
        sublabel: `${truncateAddress(citation.address)} via ${citation.provider}`,
        icon: "vasp",
        locator: {
          target: {
            type: "vasp_panel",
            address: citation.address,
          },
        },
        externalUrl: citation.sourceUrl,
      };

    case "bridge_contract":
      return {
        id: citation.id,
        label: `Bridge: ${citation.verifiedLabel ?? truncateAddress(citation.contractAddress)}`,
        sublabel: `Chain: ${citation.chain} · Status: ${citation.exitStatus}`,
        icon: "bridge",
        locator: {
          target: {
            type: "external_url",
            url: citation.sourceUrl ?? `https://etherscan.io/address/${citation.contractAddress}`,
          },
        },
      };

    case "ens":
      return {
        id: citation.id,
        label: `ENS: ${citation.ensName}`,
        sublabel: truncateAddress(citation.address),
        icon: "ens",
        locator: {
          target: {
            type: "vasp_panel", // Reuse address panel
            address: citation.address,
          },
        },
      };

    case "methodology":
      return {
        id: citation.id,
        label: "Methodology",
        sublabel: citation.description?.slice(0, 60),
        icon: "methodology",
        locator: {
          target: { type: "methodology_footer" },
        },
      };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function truncateAddress(addr: string): string {
  if (addr.length <= 13) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function truncateHash(hash: string): string {
  if (hash.length <= 13) return hash;
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}
