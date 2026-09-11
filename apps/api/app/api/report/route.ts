import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { Parser } from "json2csv";
import type { AttributionResponse } from "../../../../../packages/shared-types";

function buildPdfStream(data: AttributionResponse): ReadableStream {
  return new ReadableStream({
    start(controller) {
      const doc = new PDFDocument({ margin: 50 });
      
      doc.on('data', chunk => controller.enqueue(chunk));
      doc.on('end', () => controller.close());

      // Write PDF content
      doc.fontSize(20).text("Trace Attribution Report", { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).text(`Wallet Addess: ${data.wallet}`);
      doc.text(`Nearest VASP: ${data.nearestVaspLabel || data.nearestVasp || 'None'}`);
      doc.text(`Risk Level: ${data.risk}`);
      doc.text(`Confidence: ${data.confidence || 'N/A'}`);
      doc.text(`Sanctions Detected: ${data.sanctionsDetail && data.sanctionsDetail.length > 0 ? 'Yes' : 'No'}`);
      doc.text(`Mixer Exposure: ${data.mixerExposure.length > 0 ? 'Yes' : 'No'}`);
      doc.text(`Data Source: ${data.dataSource}`);
      doc.text(`Data Provenance: ${data.dataProvenance?.source} (Fetched at ${data.dataProvenance?.fetchedAt ? new Date(data.dataProvenance.fetchedAt).toLocaleString() : 'N/A'})`);
      doc.moveDown();

      doc.fontSize(16).text("Path Breakdown");
      doc.moveDown();

      data.paths.forEach((path, i) => {
        doc.fontSize(14).text(`Path ${i + 1} (Score: ${path.score.toFixed(3)})`);
        doc.fontSize(10);
        path.path.forEach((address, j) => {
          const isLast = j === path.path.length - 1;
          const label = isLast ? path.vasp : "";
          doc.text(`  Hop ${j}: ${address} ${label ? `[${label}]` : ''}`);
        });
        doc.moveDown();
      });

      doc.end();
    }
  });
}

function buildCsvString(data: AttributionResponse): string {
  const rows: any[] = [];
  data.paths.forEach((path, i) => {
    path.path.forEach((address, j) => {
      const isLast = j === path.path.length - 1;
      const label = isLast ? path.vasp : "";
      rows.push({
        PathIndex: i + 1,
        HopIndex: j,
        Address: address,
        Label: label,
        IsSanctioned: data.sanctionsDetail?.some(s => s.address.toLowerCase() === address.toLowerCase()) ? "Yes" : "No",
        IsMixer: data.mixerExposure.some(m => m.address.toLowerCase() === address.toLowerCase()) ? "Yes" : "No",
      });
    });
  });

  const parser = new Parser({ fields: ["PathIndex", "HopIndex", "Address", "Label", "IsSanctioned", "IsMixer"] });
  return parser.parse(rows);
}

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const format = url.searchParams.get("format") || "pdf";
    let data: AttributionResponse;
    try {
      data = await req.json();
    } catch (e: any) {
      return NextResponse.json({ error: "Invalid or malformed JSON payload" }, { status: 400 });
    }

    const origin = req.headers.get("origin") || "*";
    const corsHeaders = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
    };

    if (format === "csv") {
      const csvString = buildCsvString(data);
      return new NextResponse(csvString, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="trace_report_${data.wallet}.csv"`,
        },
      });
    } else {
      const stream = buildPdfStream(data);
      return new NextResponse(stream, {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="trace_report_${data.wallet}.pdf"`,
        },
      });
    }
  } catch (err: any) {
    const origin = req.headers.get("origin") || "*";
    return NextResponse.json({ error: err.message }, { 
      status: 500,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
      }
    });
  }
}
