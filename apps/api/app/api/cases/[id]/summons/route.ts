import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { getSupabaseAdmin } from "../../../../../lib/domains/core/auditLog";
import { loadAttributionResult } from "../../../../../lib/domains/core/resultStore";
import type { AttributionResponse, ScoredAttribution } from "../../../../../../../packages/shared-types";

function buildSummonsPdfStream(data: AttributionResponse, caseId: string): ReadableStream {
  return new ReadableStream({
    start(controller) {
      const doc = new PDFDocument({ margin: 50 });
      doc.on("data", (chunk) => controller.enqueue(chunk));
      doc.on("end", () => controller.close());

      // Draft Watermark
      doc.save();
      doc.fillColor("#FF0000").opacity(0.15).fontSize(60);
      doc.rotate(-45, { origin: [doc.page.width / 2, doc.page.height / 2] });
      doc.text("DRAFT", doc.page.width / 2 - 100, doc.page.height / 2 - 50, { align: "center" });
      doc.restore();

      // Header
      doc.fontSize(14).font("Helvetica-Bold").text("SUMMONS TO PRODUCE DOCUMENT OR OTHER THING", { align: "center", underline: true });
      doc.fontSize(12).text("(Section 94 of the Bharatiya Nagarik Suraksha Sanhita, 2023)", { align: "center" });
      doc.moveDown(2);
      
      doc.fontSize(11).font("Helvetica");
      doc.text(`Case Reference / FIR No.: ${caseId}`);
      doc.text(`Date: ${new Date().toLocaleDateString()}`);
      doc.text(`Trace Request ID: ${data.requestId || "n/a"}`);
      doc.moveDown();

      // Recipient (VASP)
      doc.font("Helvetica-Bold").text("To,");
      doc.font("Helvetica").text("The Principal Officer / Nodal Officer,");
      const vaspName = data.nearestVaspLabel || data.nearestVasp || "Unknown VASP";
      doc.font("Helvetica-Bold").text(vaspName);
      doc.font("Helvetica").text("(Registered under FIU-IND as Virtual Asset Service Provider)");
      doc.moveDown();

      // Subject
      doc.font("Helvetica-Bold").text("Subject: Production of KYC details, transaction logs, and freezing of accounts associated with cryptocurrency addresses.", { underline: true });
      doc.moveDown();

      // Body
      doc.font("Helvetica").text("Whereas it has been made to appear to me that the production of specific electronic records and documents is necessary and desirable for the purpose of an ongoing investigation under the aforementioned Case Reference.");
      doc.moveDown();
      doc.text("During the course of the investigation, digital forensic tracing of the target wallet address:");
      doc.font("Helvetica-Bold").text(`${data.wallet}`, { indent: 20 });
      doc.font("Helvetica").moveDown();
      doc.text("Revealed that illicit funds were transferred and deposited into the following wallet address(es) controlled by your exchange:");

      // List deposit addresses (last node in the paths)
      doc.moveDown();
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
        depositAddresses.add(data.nearestVasp); // Fallback to nearestVasp if path logic didn't catch it
      }
      
      depositAddresses.forEach(addr => {
        doc.font("Helvetica-Bold").text(`• ${addr}`, { indent: 20 });
      });
      
      doc.font("Helvetica").moveDown();
      doc.text("You are hereby summoned under Section 94 of the Bharatiya Nagarik Suraksha Sanhita, 2023 to produce the following records pertaining to the aforementioned deposit address(es):");
      doc.moveDown(0.5);
      doc.text("1. Complete KYC/AML documentation of the user account controlling the deposit address.", { indent: 20 });
      doc.text("2. Complete ledger of transactions (deposits and withdrawals) for the user account.", { indent: 20 });
      doc.text("3. IP logs, device identifiers, and login history associated with the user account.", { indent: 20 });
      doc.moveDown();
      doc.text("You are further directed to immediately suspend/freeze all outward transfers from the associated user account pending further orders, to prevent the dissipation of proceeds of crime.");
      doc.moveDown(2);

      // Signature Block
      doc.text("Given under my hand and the seal of the Court/Police Station this day.");
      doc.moveDown(3);
      
      doc.text("Signature: __________________________");
      doc.text("Name:      __________________________");
      doc.text("Rank:      __________________________");
      doc.text("Unit/Station: __________________________");

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

    const stored = await loadAttributionResult(requestId);
    if (!stored) {
      return NextResponse.json(
        { error: "Trace not found or expired. Re-run attribution to generate a new valid request ID." },
        { status: 404 }
      );
    }

    // Only allow for onshore_registered VASPs
    if (stored.vaspClassification?.classification !== "onshore_registered") {
      return NextResponse.json(
        { error: "BNSS Section 94 summons can only be generated for onshore (domestic) registered VASPs." },
        { status: 403 }
      );
    }

    await admin.from("case_history").insert({
      case_id: caseId,
      from_state: null,
      to_state: caseRow.status || "open",
      actor_id: "system",
      actor_type: "system",
      reason: "Drafted BNSS Section 94 Summons for trace",
      metadata: { requestId, vasp: stored.nearestVaspLabel },
    });

    const stream = buildSummonsPdfStream(stored, caseId);

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="draft_bnss94_summons_${stored.wallet}.pdf"`,
      },
    });
  } catch (err: any) {
    console.error("[BNSS 94 Summons Route] Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
