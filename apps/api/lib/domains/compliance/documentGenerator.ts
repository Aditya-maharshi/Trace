/**
 * lib/domains/compliance/documentGenerator.ts
 *
 * Generates the three statutory output documents that make a trace result
 * legally actionable under Indian criminal procedure:
 *
 *   1. Section 63 certificate (Bharatiya Sakshya Adhiniyam, 2023)
 *      Certifies the computer output is authentic and the process was sound.
 *
 *   2. Section 94 summons (Bharatiya Nagarik Suraksha Sanhita, 2023)
 *      Production order to the VASP — pre-filled with corporate particulars
 *      and the target wallet address.
 *
 *   3. SAHYOG freeze request (IT Act 2000, Section 79(3)(b))
 *      Payload pushed to the SAHYOG portal to freeze the attributed wallet.
 *
 *   4. IVMS 101 Travel Rule payload (FATF Recommendation 16)
 *      Originator / beneficiary data package for cross-VASP compliance.
 *
 * ### Design
 * Documents are generated AS TEXT (structured JSON or plain-text certificate
 * bodies) rather than as binary PDFs here. The PDF rendering (using pdfkit)
 * is done in the report API route (`/api/report/[id]`) which streams the PDF
 * directly to the browser. Separating generation from rendering keeps this
 * module testable and the generation logic reusable by any output format.
 *
 * ### Integrity
 * Every document includes a SHA-256 hash of its content embedded in the
 * document itself (like a self-authenticating seal), consistent with the
 * docket UI in GovernmentLandingPage.tsx which shows "Dossier SHA-256 a3f9…20c7".
 *
 * ### Evidence hash
 * The caller must provide a `traceEvidenceHash` — SHA-256 of the canonical
 * JSON representation of the attribution result. This is the same hash
 * embedded in the SAHYOG payload and the Section 63 certificate.
 * Use `computePayloadHash()` from caseStore.ts to generate it.
 */

import crypto from "crypto";
import type { AttributionResponse } from "@sih/shared-types";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface DocumentGenerationInput {
  attribution: AttributionResponse;
  caseReference: string;
  traceEvidenceHash: string;
  requestingUnit: string;   // e.g. "Cyber Crime Cell, Ahmedabad"
  officerName: string;      // e.g. "Insp. R. Parmar"
  officerId: string;        // e.g. "ID 4471"
  generatedAt?: string;     // ISO 8601, defaults to now()
}

export interface Section63Certificate {
  documentType: "section_63_certificate";
  /** Bharatiya Sakshya Adhiniyam, 2023 — Section 63 */
  statutoryBasis: string;
  caseReference: string;
  partA: {
    deviceDescription: string;
    outputDescription: string;
    processDescription: string;
    evidenceHash: string;
    officerDeclaration: string;
  };
  partB: {
    extractionAuditTrail: string;
    expertSignOffRequired: boolean;
    dataIntegrityNote: string;
  };
  contentHash: string;
  generatedAt: string;
  generatedBy: string;
}

export interface Section94Summons {
  documentType: "section_94_summons";
  /** Bharatiya Nagarik Suraksha Sanhita, 2023 — Section 94 */
  statutoryBasis: string;
  caseReference: string;
  addressedTo: {
    vaspLabel: string;
    vaspAddress: string;
  };
  targetAddress: string;
  evidenceHash: string;
  demandedRecords: string[];
  responseDeadlineDays: number;
  contentHash: string;
  generatedAt: string;
  issuingOfficer: string;
}

export interface SahyogFreezeRequest {
  documentType: "sahyog_freeze_request";
  /** IT Act 2000, Section 79(3)(b) */
  statutoryBasis: string;
  caseReference: string;
  targetAddress: string;
  attributedVasp: string;
  depositAddresses: string[];
  traceEvidenceHash: string;
  requestingUnit: string;
  timestamp: string;
  status: "PREPARED_NOT_TRANSMITTED";
  transmissionNote: string;
  contentHash: string;
  generatedAt: string;
}

export interface IVMS101Payload {
  documentType: "ivms101_travel_rule";
  /** FATF Recommendation 16 */
  statutoryBasis: string;
  caseReference: string;
  originator: {
    address: string;
    chain: string;
  };
  beneficiary: {
    vaspLabel: string;
    vaspAddress: string;
  };
  transferAmount: {
    value: number;
    currency: string;
  };
  evidenceHash: string;
  contentHash: string;
  generatedAt: string;
}

export interface GeneratedDocuments {
  section63: Section63Certificate;
  section94: Section94Summons;
  sahyogFreeze: SahyogFreezeRequest;
  ivms101: IVMS101Payload;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hash helpers
// ─────────────────────────────────────────────────────────────────────────────

function sha256Hex(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function selfHashDocument<T extends object>(doc: T): T & { contentHash: string } {
  // Hash the document WITHOUT the contentHash field (which would be circular)
  const withoutHash = Object.fromEntries(
    Object.entries(doc).filter(([k]) => k !== "contentHash")
  );
  const contentHash = sha256Hex(JSON.stringify(withoutHash, null, 0));
  return { ...doc, contentHash };
}

// ─────────────────────────────────────────────────────────────────────────────
// Document generators
// ─────────────────────────────────────────────────────────────────────────────

function generateSection63(input: DocumentGenerationInput): Section63Certificate {
  const generatedAt = input.generatedAt ?? new Date().toISOString();

  const doc: Section63Certificate = {
    documentType: "section_63_certificate",
    statutoryBasis: "Bharatiya Sakshya Adhiniyam, 2023 — Section 63 (Electronic Records)",
    caseReference: input.caseReference,
    partA: {
      deviceDescription:
        "Server-side blockchain graph traversal system (Trace, version 1.0). " +
        "Trace is a deterministic BFS-based wallet attribution system operating on " +
        "publicly available on-chain data sourced from Etherscan and Blockscout APIs.",
      outputDescription:
        `Attribution result for wallet ${input.attribution.wallet}. ` +
        `Nearest VASP: ${input.attribution.nearestVaspLabel ?? input.attribution.nearestVasp ?? "None identified"}. ` +
        `Confidence: ${input.attribution.confidence ?? "Unavailable"}. ` +
        `Hops: ${input.attribution.hops ?? "N/A"}. ` +
        `Risk: ${input.attribution.risk}.`,
      processDescription:
        "Bounded breadth-first traversal of the Ethereum transaction graph. " +
        "Transaction data fetched from Etherscan API (primary) with Blockscout as fallback. " +
        "Methodology disclosure: " + input.attribution.methodology.notice,
      evidenceHash: input.traceEvidenceHash,
      officerDeclaration:
        `I, ${input.officerName} (${input.officerId}), certify that the computer output ` +
        `described above was produced by the Trace blockchain investigation system ` +
        `in the ordinary course of its operation at ${generatedAt}. ` +
        `The system was functioning correctly at the time of output. ` +
        `SHA-256 integrity hash: ${input.traceEvidenceHash.slice(0, 12)}…`,
    },
    partB: {
      extractionAuditTrail:
        `Trace request submitted at ${generatedAt} by ${input.officerName}. ` +
        `Request ID: ${input.attribution.requestId ?? "N/A"}. ` +
        `Data fetched at: ${input.attribution.dataProvenance?.fetchedAt ?? generatedAt}. ` +
        `Source: ${input.attribution.dataProvenance?.source ?? "live-etherscan"}.`,
      expertSignOffRequired: true,
      dataIntegrityNote:
        "The SHA-256 hash embedded in Part A must be verified against the server-stored " +
        "trace result (keyed by requestId) before this certificate is submitted to court. " +
        "Do not use a client-submitted JSON payload — always re-derive from the server store.",
    },
    contentHash: "", // filled by selfHashDocument
    generatedAt,
    generatedBy: `${input.officerName} (${input.officerId}), ${input.requestingUnit}`,
  };

  return selfHashDocument(doc);
}

function generateSection94(input: DocumentGenerationInput): Section94Summons {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const vaspLabel = input.attribution.nearestVaspLabel ?? input.attribution.nearestVasp ?? "Unknown VASP";
  const vaspAddress = input.attribution.nearestVasp ?? "Unknown";

  const doc: Section94Summons = {
    documentType: "section_94_summons",
    statutoryBasis: "Bharatiya Nagarik Suraksha Sanhita, 2023 — Section 94 (Production of Documents)",
    caseReference: input.caseReference,
    addressedTo: {
      vaspLabel,
      vaspAddress,
    },
    targetAddress: input.attribution.wallet,
    evidenceHash: input.traceEvidenceHash,
    demandedRecords: [
      `Complete KYC record for the account holder of address ${input.attribution.wallet}`,
      `All transaction history for address ${input.attribution.wallet} on your platform`,
      `Any associated email addresses, phone numbers, PAN, or Aadhaar linked to this account`,
      `IP address logs for logins associated with this account`,
      `Any freeze, withdrawal, or suspicious activity flags already applied to this account`,
    ],
    responseDeadlineDays: 15,
    contentHash: "",
    generatedAt,
    issuingOfficer: `${input.officerName} (${input.officerId}), ${input.requestingUnit}`,
  };

  return selfHashDocument(doc);
}

function generateSahyogFreezeRequest(input: DocumentGenerationInput): SahyogFreezeRequest {
  const generatedAt = input.generatedAt ?? new Date().toISOString();

  // Compile deposit addresses from path endpoints
  const depositAddresses = new Set<string>();
  for (const p of input.attribution.paths) {
    if (p.path?.length > 0) {
      const dest = p.path[p.path.length - 1];
      if (dest.toLowerCase() === input.attribution.nearestVasp?.toLowerCase()) {
        depositAddresses.add(dest);
      }
    }
  }
  if (depositAddresses.size === 0 && input.attribution.nearestVasp) {
    depositAddresses.add(input.attribution.nearestVasp);
  }

  const doc: SahyogFreezeRequest = {
    documentType: "sahyog_freeze_request",
    statutoryBasis: "Information Technology Act, 2000 — Section 79(3)(b)",
    caseReference: input.caseReference,
    targetAddress: input.attribution.wallet,
    attributedVasp: input.attribution.nearestVaspLabel ?? input.attribution.nearestVasp ?? "Unknown VASP",
    depositAddresses: Array.from(depositAddresses),
    traceEvidenceHash: input.traceEvidenceHash,
    requestingUnit: input.requestingUnit,
    timestamp: generatedAt,
    status: "PREPARED_NOT_TRANSMITTED",
    transmissionNote:
      "This payload has been compiled and is queued for transmission to the SAHYOG portal. " +
      "Transmission requires explicit confirmation by the supervising officer via the " +
      "Trace console (/api/sahyog/{caseId}/confirm). " +
      "SAHYOG portal real credentials are not yet configured — the payload is stored in " +
      "PREPARED_NOT_TRANSMITTED status until real credentials are provided.",
    contentHash: "",
    generatedAt,
  };

  return selfHashDocument(doc);
}

function generateIVMS101(input: DocumentGenerationInput): IVMS101Payload {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const bestPath = input.attribution.paths[0];
  const totalValue = bestPath?.breakdown?.totalValueUSD ?? 0;
  const asset = bestPath?.assetsInvolved?.[0] ?? "ETH";

  const doc: IVMS101Payload = {
    documentType: "ivms101_travel_rule",
    statutoryBasis: "FATF Recommendation 16 — Travel Rule (IVMS 101 data format)",
    caseReference: input.caseReference,
    originator: {
      address: input.attribution.wallet,
      chain: (input.attribution as any).chain ?? "ethereum",
    },
    beneficiary: {
      vaspLabel: input.attribution.nearestVaspLabel ?? "Unknown VASP",
      vaspAddress: input.attribution.nearestVasp ?? "Unknown",
    },
    transferAmount: {
      value: Math.round(totalValue * 100) / 100,
      currency: asset,
    },
    evidenceHash: input.traceEvidenceHash,
    contentHash: "",
    generatedAt,
  };

  return selfHashDocument(doc);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate all four statutory output documents from a completed attribution result.
 *
 * Returns the documents as structured JSON objects. The caller is responsible for:
 *   1. Persisting the documents (or their hashes) to the `generated_documents` table.
 *   2. Rendering them as PDF via /api/report/[id] if needed.
 *   3. Submitting the SAHYOG freeze request via /api/sahyog/[caseId]/confirm.
 */
export function generateAllDocuments(
  input: DocumentGenerationInput,
): GeneratedDocuments {
  return {
    section63: generateSection63(input),
    section94: generateSection94(input),
    sahyogFreeze: generateSahyogFreezeRequest(input),
    ivms101: generateIVMS101(input),
  };
}

/**
 * Compute a canonical SHA-256 hash of an attribution result for evidence integrity.
 * Matches the `computePayloadHash()` function in caseStore.ts.
 */
export function computeEvidenceHash(attribution: AttributionResponse): string {
  return sha256Hex(JSON.stringify(attribution));
}
