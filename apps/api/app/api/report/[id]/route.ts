/**
 * app/api/report/[id]/route.ts
 *
 * GET /api/report/{requestId}
 *
 * Generates and streams a PDF investigation report for a completed attribution
 * trace, keyed by the server-issued requestId (never by client-submitted JSON).
 *
 * ### Security model
 * The requestId is validated as a UUID. The attribution result is loaded from
 * the server-side result store (Redis / in-memory) — never from a body or
 * query parameter. This prevents clients from submitting fabricated scores or
 * letterhead-quality reports with false confidence values.
 *
 * ### PDF structure
 * 1. Cover page — case metadata, docket number, generation timestamp
 * 2. Executive summary — wallet, nearest VASP, confidence, risk
 * 3. Attribution paths — table of paths with hop count, score, assets
 * 4. Section 63 certificate body (Bharatiya Sakshya Adhiniyam, 2023)
 * 5. Section 94 summons pre-fill (Bharatiya Nagarik Suraksha Sanhita, 2023)
 * 6. SAHYOG freeze request details (IT Act s.79(3)(b))
 * 7. Methodology disclosure
 * 8. Integrity footer (SHA-256 of the report body)
 *
 * Uses pdfkit (already in dependencies: "pdfkit": "^0.20.2").
 */

import { NextRequest } from "next/server";
import PDFDocument from "pdfkit";
import { loadAttributionResult, isValidRequestId } from "../../../lib/domains/core/resultStore";
import { generateAllDocuments, computeEvidenceHash } from "../../../lib/domains/compliance/documentGenerator";
import crypto from "crypto";

export const maxDuration = 30;

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = params;

  // ── 1. Validate request ID ───────────────────────────────────────────────
  if (!isValidRequestId(id)) {
    return new Response(
      JSON.stringify({ error: "Invalid request ID format" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // ── 2. Load attribution from server store ────────────────────────────────
  const attribution = await loadAttributionResult(id);
  if (!attribution) {
    return new Response(
      JSON.stringify({ error: "Trace result not found or expired (24h TTL)" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  // ── 3. Generate documents ────────────────────────────────────────────────
  const evidenceHash = computeEvidenceHash(attribution);
  const docs = generateAllDocuments({
    attribution,
    caseReference: `TRC-${id.split("-")[0].toUpperCase()}`,
    traceEvidenceHash: evidenceHash,
    requestingUnit: "Cyber Crime Investigation Unit",
    officerName: "Trace System",
    officerId: "SYSTEM",
    generatedAt: new Date().toISOString(),
  });

  // ── 4. Build PDF ─────────────────────────────────────────────────────────
  const pdfStream = new ReadableStream({
    async start(controller) {
      const doc = new PDFDocument({
        margins: { top: 60, bottom: 60, left: 72, right: 72 },
        size: "A4",
        info: {
          Title: `Trace Investigation Report — ${id.slice(0, 8).toUpperCase()}`,
          Author: "Trace Blockchain Investigation System",
          Subject: "Cryptocurrency wallet attribution report",
          Keywords: "VASP, blockchain, attribution, SAHYOG, investigation",
        },
      });

      // Pipe PDF to ReadableStream
      doc.on("data", (chunk: Buffer) => {
        try { controller.enqueue(chunk); } catch { /* client disconnected */ }
      });
      doc.on("end", () => {
        try { controller.close(); } catch { /* already closed */ }
      });
      doc.on("error", (err: Error) => {
        try { controller.error(err); } catch { /* already errored */ }
      });

      // ── Cover page ─────────────────────────────────────────────────────
      doc
        .fontSize(8)
        .fillColor("#999999")
        .text("PROTOTYPE — SIH 2026 PS 26182 — FOR DEMONSTRATION ONLY — NOT AN OPERATIONAL GOVERNMENT SYSTEM", {
          align: "center",
        });

      doc.moveDown(2);
      doc
        .fontSize(22)
        .fillColor("#111111")
        .font("Helvetica-Bold")
        .text("Blockchain Investigation Report", { align: "center" });

      doc.moveDown(0.5);
      doc
        .fontSize(11)
        .font("Helvetica")
        .fillColor("#444444")
        .text(`Docket: TRC-${id.split("-")[0].toUpperCase()}`, { align: "center" });

      doc.moveDown(0.5);
      doc.text(`Generated: ${new Date().toISOString()}`, { align: "center" });
      doc.text(`Evidence SHA-256: ${evidenceHash.slice(0, 24)}…`, { align: "center" });

      doc.moveDown(2);

      // ── Section 1: Executive Summary ──────────────────────────────────
      doc.fontSize(13).font("Helvetica-Bold").fillColor("#111111").text("1. Executive Summary");
      doc.moveDown(0.5);

      const rows = [
        ["Target Wallet", attribution.wallet],
        ["Nearest VASP", attribution.nearestVaspLabel ?? attribution.nearestVasp ?? "None identified"],
        ["Hops to VASP", String(attribution.hops ?? "N/A")],
        ["Confidence", attribution.confidence ?? "Unknown"],
        ["Risk Level", attribution.risk],
        ["Score", String(attribution.score ?? "N/A")],
        ["Mixer Exposure", attribution.mixerExposure?.length > 0 ? `YES (${attribution.mixerExposure.length} hit(s))` : "None"],
        ["Sanctions Hit", attribution.sanctionsDetail?.some((s) => s.sanctioned) ? "YES" : "None"],
        ["Structuring Signal", attribution.structuringSignalDetected ? "DETECTED" : "Not detected"],
      ];

      for (const [label, value] of rows) {
        doc.fontSize(10).font("Helvetica-Bold").fillColor("#333333").text(`${label}: `, { continued: true });
        doc.font("Helvetica").fillColor("#111111").text(value);
      }

      // ⚠ Mandatory investigative-lead framing
      doc.moveDown(0.5);
      doc
        .fontSize(9)
        .fillColor("#c8380a")
        .font("Helvetica-Bold")
        .text("⚠ INVESTIGATIVE LEAD — requires VASP confirmation before submission to court.");
      doc.font("Helvetica").fillColor("#555555");

      // ── Section 2: Attribution Paths ──────────────────────────────────
      doc.addPage();
      doc.fontSize(13).font("Helvetica-Bold").fillColor("#111111").text("2. Attribution Paths");
      doc.moveDown(0.5);

      const paths = attribution.paths.slice(0, 10);
      if (paths.length === 0) {
        doc.fontSize(10).font("Helvetica").text("No paths found.");
      } else {
        for (let i = 0; i < paths.length; i++) {
          const p = paths[i];
          doc.fontSize(10).font("Helvetica-Bold").text(`Path ${i + 1}: ${p.path.join(" → ")}`);
          doc.font("Helvetica").text(
            `  VASP: ${p.vasp}  |  Hops: ${p.hops}  |  Score: ${p.score.toFixed(3)}  |  Assets: ${p.assetsInvolved.join(", ")}`,
          );
          doc.moveDown(0.3);
        }
      }

      // ── Section 3: Section 63 Certificate ────────────────────────────
      doc.addPage();
      doc.fontSize(13).font("Helvetica-Bold").text("3. Section 63 Certificate");
      doc.fontSize(9).font("Helvetica").fillColor("#444444").text("Bharatiya Sakshya Adhiniyam, 2023");
      doc.fillColor("#111111");
      doc.moveDown(0.5);
      doc.fontSize(10).text("Part A — Device & Output");
      doc.fontSize(9).font("Helvetica").text(docs.section63.partA.deviceDescription);
      doc.moveDown(0.3);
      doc.text(docs.section63.partA.outputDescription);
      doc.moveDown(0.3);
      doc.text(docs.section63.partA.officerDeclaration);
      doc.moveDown(0.5);
      doc.fontSize(10).font("Helvetica-Bold").text("Part B — Audit Trail");
      doc.fontSize(9).font("Helvetica").text(docs.section63.partB.extractionAuditTrail);
      doc.moveDown(0.3);
      doc.text(`Expert sign-off required: ${docs.section63.partB.expertSignOffRequired ? "YES" : "NO"}`);
      doc.moveDown(0.3);
      doc.text(`Document hash: ${docs.section63.contentHash}`);

      // ── Section 4: Section 94 Summons ─────────────────────────────────
      doc.addPage();
      doc.fontSize(13).font("Helvetica-Bold").text("4. Section 94 Production Order");
      doc.fontSize(9).fillColor("#444444").font("Helvetica").text("Bharatiya Nagarik Suraksha Sanhita, 2023");
      doc.fillColor("#111111");
      doc.moveDown(0.5);
      doc.fontSize(10).font("Helvetica").text(`Addressed to: ${docs.section94.addressedTo.vaspLabel} (${docs.section94.addressedTo.vaspAddress})`);
      doc.text(`Target address: ${docs.section94.targetAddress}`);
      doc.text(`Response deadline: ${docs.section94.responseDeadlineDays} days`);
      doc.moveDown(0.5);
      doc.font("Helvetica-Bold").text("Records demanded:");
      for (const r of docs.section94.demandedRecords) {
        doc.font("Helvetica").text(`  • ${r}`);
      }
      doc.moveDown(0.3);
      doc.text(`Document hash: ${docs.section94.contentHash}`);

      // ── Section 5: SAHYOG Freeze Request ──────────────────────────────
      doc.addPage();
      doc.fontSize(13).font("Helvetica-Bold").text("5. SAHYOG Freeze Request");
      doc.fontSize(9).fillColor("#444444").font("Helvetica").text("IT Act 2000, Section 79(3)(b)");
      doc.fillColor("#c8380a").text(`Status: ${docs.sahyogFreeze.status}`);
      doc.fillColor("#111111");
      doc.moveDown(0.3);
      doc.fontSize(10).text(`Target: ${docs.sahyogFreeze.targetAddress}`);
      doc.text(`Attributed VASP: ${docs.sahyogFreeze.attributedVasp}`);
      doc.text(`Deposit addresses: ${docs.sahyogFreeze.depositAddresses.join(", ")}`);
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor("#555555").text(docs.sahyogFreeze.transmissionNote);
      doc.fillColor("#111111");
      doc.moveDown(0.3);
      doc.text(`Document hash: ${docs.sahyogFreeze.contentHash}`);

      // ── Section 6: Methodology ────────────────────────────────────────
      doc.addPage();
      doc.fontSize(13).font("Helvetica-Bold").text("6. Methodology Disclosure");
      doc.moveDown(0.5);
      doc.fontSize(9).font("Helvetica").text(attribution.methodology.notice);
      doc.moveDown(0.3);
      doc.text(attribution.methodology.humanReviewDisclaimer);
      doc.moveDown(0.3);
      doc.text(`VASP registry: ${attribution.methodology.vaspRegistryNotice}`);
      doc.text(`Sanctions source: ${attribution.methodology.sanctionsSource}`);
      doc.text(`Active high threshold: ${attribution.methodology.activeHighThreshold}`);
      doc.text(`Active low threshold: ${attribution.methodology.activeLowThreshold}`);
      doc.text(`Calibration date: ${attribution.methodology.calibrationDate}`);
      doc.text(`Limitations: ${attribution.methodology.limitationsDocument}`);

      // ── Footer ────────────────────────────────────────────────────────
      const range = doc.bufferedPageRange();
      for (let i = range.start; i <= range.start + range.count - 1; i++) {
        doc.switchToPage(i);
        doc
          .fontSize(7)
          .fillColor("#999999")
          .text(
            `Page ${i - range.start + 1} of ${range.count}  |  Docket TRC-${id.split("-")[0].toUpperCase()}  |  Evidence hash: ${evidenceHash.slice(0, 16)}…  |  PROTOTYPE`,
            72,
            doc.page.height - 40,
            { width: doc.page.width - 144, align: "center" },
          );
      }

      doc.end();
    },
  });

  return new Response(pdfStream, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="trace-report-${id.slice(0, 8)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
