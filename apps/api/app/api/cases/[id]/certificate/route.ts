import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { getSupabaseAdmin } from "../../../../../lib/domains/core/auditLog";
import { loadAttributionResult } from "../../../../../lib/domains/core/resultStore";
import { computePayloadHash } from "../../../../../lib/domains/cases/caseStore";
import type { AttributionResponse } from "../../../../../../../packages/shared-types";

function buildCertificatePdfStream(data: AttributionResponse, caseId: string, payloadHash: string): ReadableStream {
  return new ReadableStream({
    start(controller) {
      const doc = new PDFDocument({ margin: 50 });
      doc.on("data", (chunk) => controller.enqueue(chunk));
      doc.on("end", () => controller.close());

      // Header
      doc.fontSize(16).text("CERTIFICATE UNDER SECTION 63 OF BHARATIYA SAKSHYA ADHINIYAM, 2023", { align: "center" });
      doc.moveDown(2);
      
      doc.fontSize(12).font("Helvetica-Bold").text(`Case Reference: ${caseId}`);
      doc.font("Helvetica").text(`Trace Request ID: ${data.requestId || "n/a"}`);
      doc.moveDown();

      // Hash Box
      doc.rect(50, doc.y, 500, 40).stroke();
      doc.moveDown(0.5);
      doc.font("Helvetica-Bold").text("SHA-256 Hash of Electronic Record:", { align: "center" });
      doc.font("Courier").text(payloadHash, { align: "center" });
      doc.moveDown(1.5);

      // Part A
      doc.font("Helvetica-Bold").text("PART A: DEVICE AND OUTPUT PARTICULARS", { underline: true });
      doc.font("Helvetica").moveDown(0.5);
      doc.text("I, _________________________________________________ [Name & Designation], being the Investigating Officer for the aforementioned case, do hereby certify that the electronic record (trace dossier) whose cryptographic hash is printed above was produced by a computer resource (server) under my lawful control in the ordinary course of official duties.");
      doc.moveDown();
      doc.text(`Target Wallet Address: ${data.wallet}`);
      doc.text(`Attributed VASP: ${data.nearestVaspLabel || data.nearestVasp || "Unknown"}`);
      doc.text(`VASP Classification: ${data.vaspClassification?.classification || "Unknown"} (${data.vaspClassification?.availableInstruments?.join(", ") || "None"})`);
      doc.moveDown(2);
      
      doc.text("Signature: __________________________");
      doc.text("Date:      __________________________");
      doc.text("Name:      __________________________");
      doc.text("Rank:      __________________________");
      doc.moveDown(2);

      // Part B
      doc.font("Helvetica-Bold").text("PART B: TECHNICAL EXTRACTION AUDIT TRAIL", { underline: true });
      doc.font("Helvetica").moveDown(0.5);
      doc.text("The technical extraction was conducted automatically by the Trace system without human alteration of the underlying blockchain RPC responses.");
      doc.moveDown(0.5);
      doc.text(`Data Source: ${data.dataSource}`);
      doc.text(`Data Provenance: ${data.dataProvenance?.source}`);
      doc.text(`Extraction Time: ${data.dataProvenance?.fetchedAt ? new Date(data.dataProvenance.fetchedAt).toLocaleString() : "N/A"}`);
      
      if (data.incompleteTraversal?.skippedNodes > 0 || data.incompleteTraversal?.timeoutReached) {
        doc.moveDown(0.5);
        doc.text(`Note: ${data.incompleteTraversal.skippedNodes} nodes were skipped. Timeout reached: ${data.incompleteTraversal.timeoutReached ? "Yes" : "No"}`);
      }
      doc.moveDown(2);

      doc.text("Signature of Technical Expert: __________________________");
      doc.text("Date:                          __________________________");
      doc.text("Name:                          __________________________");
      doc.text("Designation:                   __________________________");

      // Detailed Paths
      doc.addPage();
      doc.fontSize(14).font("Helvetica-Bold").text("APPENDIX: EXTRACTED GRAPH PATHS");
      doc.moveDown();

      data.paths.forEach((path, i) => {
        doc.fontSize(12).font("Helvetica-Bold").text(`Path ${i + 1} (Score: ${path.score.toFixed(3)})`);
        doc.fontSize(10).font("Helvetica");
        path.path.forEach((address, j) => {
          const isLast = j === path.path.length - 1;
          const label = isLast ? path.vasp : "";
          doc.text(`  Hop ${j}: ${address} ${label ? `[${label}]` : ""}`);
        });
        doc.moveDown();
      });

      doc.end();
    },
  });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const caseId = params.id;
    let requestId: string;

    try {
      const body = await req.json();
      requestId = body.requestId;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!requestId) {
      return NextResponse.json({ error: "requestId is required" }, { status: 400 });
    }

    // 1. Verify case exists
    const admin = getSupabaseAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Database service unavailable" }, { status: 500 });
    }

    const { data: caseRow, error: caseErr } = await admin
      .from("cases")
      .select("*")
      .eq("id", caseId)
      .single();

    if (caseErr || !caseRow) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    // 2. Load the attribution result (server-side only to prevent forgery)
    const stored = await loadAttributionResult(requestId);
    if (!stored) {
      return NextResponse.json(
        { error: "Trace not found or expired. Re-run attribution to generate a new valid request ID." },
        { status: 404 }
      );
    }

    // 3. Compute hash of the electronic record
    const payloadHash = computePayloadHash(stored);

    // 4. Log in case history
    await admin.from("case_history").insert({
      case_id: caseId,
      from_state: null,
      to_state: caseRow.status || "open",
      actor_id: "system", // Normally user id, but using system for simplicity in this endpoint
      actor_type: "system",
      reason: "Generated BSA Section 63 Certificate for trace",
      metadata: { requestId, payloadHash },
    });

    // 5. Generate and return PDF
    const stream = buildCertificatePdfStream(stored, caseId, payloadHash);

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="bsa_sec63_cert_${stored.wallet}.pdf"`,
      },
    });
  } catch (err: any) {
    console.error("[BSA Sec 63 Route] Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
