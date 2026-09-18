import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { Parser } from "json2csv";
import type { AttributionResponse } from "../../../../../packages/shared-types";
import { isValidRequestId, loadAttributionResult } from "../../../lib/domains/core/resultStore";

export const maxDuration = 10;

function buildPdfStream(data: AttributionResponse): ReadableStream {
  return new ReadableStream({
    start(controller) {
      const doc = new PDFDocument({ margin: 50 });

      doc.on("data", (chunk) => controller.enqueue(chunk));
      doc.on("end", () => controller.close());

      doc.fontSize(20).text("Trace Attribution Report", { align: "center" });
      doc.moveDown();
      doc.fontSize(10).fillColor("#555").text(`Server-verified request ID: ${data.requestId || "n/a"}`);
      doc.fillColor("#000");
      doc.moveDown();
      doc.fontSize(12).text(`Wallet Address: ${data.wallet}`);
      doc.text(`Nearest VASP: ${data.nearestVaspLabel || data.nearestVasp || "None"}`);
      doc.text(`Risk Level: ${data.risk}`);
      doc.text(`Confidence: ${data.confidence || "N/A"}`);
      doc.text(`Sanctions Detected: ${data.sanctionsDetail && data.sanctionsDetail.length > 0 ? "Yes" : "No"}`);
      doc.text(`Mixer Exposure: ${data.mixerExposure.length > 0 ? "Yes" : "No"}`);
      doc.text(`Data Source: ${data.dataSource}`);
      doc.text(
        `Data Provenance: ${data.dataProvenance?.source} (Fetched at ${data.dataProvenance?.fetchedAt ? new Date(data.dataProvenance.fetchedAt).toLocaleString() : "N/A"})`,
      );
      if (data.incompleteTraversal?.historyTruncated) {
        doc.text(
          "History note: one or more wallets have more transactions than were inspected (newest 100 only).",
        );
      }
      if (data.incompleteTraversal?.timeoutReached) {
        doc.text("History note: graph traversal stopped early due to the execution time budget.");
      }
      doc.moveDown();

      doc.fontSize(16).text("Path Breakdown");
      doc.moveDown();

      data.paths.forEach((path, i) => {
        doc.fontSize(14).text(`Path ${i + 1} (Score: ${path.score.toFixed(3)})`);
        doc.fontSize(10);
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

function buildIvms101Json(data: AttributionResponse): string {
  // Extract deposit addresses
  const depositAddresses = new Set<string>();
  data.paths.forEach((p) => {
    if (p.path && p.path.length > 0) {
      const dest = p.path[p.path.length - 1];
      if (dest.toLowerCase() === data.nearestVasp?.toLowerCase()) {
        depositAddresses.add(dest);
      }
    }
  });
  if (depositAddresses.size === 0 && data.nearestVasp) {
    depositAddresses.add(data.nearestVasp);
  }

  const payload = {
    originator: {
      originatorPersons: [
        {
          naturalPerson: {
            name: {
              nameIdentifier: [
                {
                  primaryIdentifier: "Unknown Target Wallet"
                }
              ]
            }
          }
        }
      ],
      accountNumber: [data.wallet]
    },
    beneficiary: {
      beneficiaryPersons: [
        {
          legalPerson: {
            name: {
              nameIdentifier: [
                {
                  legalPersonName: data.nearestVaspLabel || data.nearestVasp || "Unknown VASP",
                  legalPersonNameIdentifierType: "LEGL"
                }
              ]
            }
          }
        }
      ],
      accountNumber: Array.from(depositAddresses)
    }
  };

  return JSON.stringify(payload, null, 2);
}

function buildCsvString(data: AttributionResponse): string {
  const rows: any[] = [];
  data.paths.forEach((path, i) => {
    path.path.forEach((address, j) => {
      const isLast = j === path.path.length - 1;
      const label = isLast ? path.vasp : "";
      rows.push({
        RequestId: data.requestId || "",
        PathIndex: i + 1,
        HopIndex: j,
        Address: address,
        Label: label,
        IsSanctioned: data.sanctionsDetail?.some((s) => s.address.toLowerCase() === address.toLowerCase())
          ? "Yes"
          : "No",
        IsMixer: data.mixerExposure.some((m) => m.address.toLowerCase() === address.toLowerCase())
          ? "Yes"
          : "No",
      });
    });
  });

  const parser = new Parser({
    fields: ["RequestId", "PathIndex", "HopIndex", "Address", "Label", "IsSanctioned", "IsMixer"],
  });
  return parser.parse(rows);
}

async function resolveStoredResult(req: Request): Promise<AttributionResponse | NextResponse> {
  const url = new URL(req.url);
  let requestId = url.searchParams.get("requestId") || "";

  if (!requestId && req.method === "POST") {
    try {
      const body = await req.json();
      if (body && typeof body.requestId === "string") {
        requestId = body.requestId;
      }
    } catch {
      return NextResponse.json({ error: "Invalid or malformed JSON payload" }, { status: 400 });
    }
  }

  if (!requestId || !isValidRequestId(requestId)) {
    return NextResponse.json(
      {
        error: "A valid server-issued requestId is required",
        details: "Re-run the attribution and export using the requestId from that response. Client-supplied trace JSON is not accepted.",
      },
      { status: 400 },
    );
  }

  const stored = await loadAttributionResult(requestId);
  if (!stored) {
    return NextResponse.json(
      {
        error: "Trace not found or expired",
        details: "Reports can only be generated from a stored server-side result (24h TTL). Re-run the attribution.",
      },
      { status: 404 },
    );
  }

  return stored;
}

function renderReport(data: AttributionResponse, format: string): NextResponse {
  if (format === "csv") {
    const csvString = buildCsvString(data);
    return new NextResponse(csvString, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="trace_report_${data.wallet}.csv"`,
      },
    });
  }

  if (format === "ivms101") {
    const jsonString = buildIvms101Json(data);
    return new NextResponse(jsonString, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="ivms101_${data.wallet}.json"`,
      },
    });
  }

  const stream = buildPdfStream(data);
  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="trace_report_${data.wallet}.pdf"`,
    },
  });
}

async function handleReport(req: Request): Promise<NextResponse> {
    const url = new URL(req.url);
    const format = url.searchParams.get("format") || "pdf";
    const resolved = await resolveStoredResult(req);
    if (resolved instanceof NextResponse) {
      return resolved;
    }
    return renderReport(resolved, format);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      {
        status: 500,
      },
    );
  }
}

export async function GET(req: Request) {
  return handleReport(req);
}

export async function POST(req: Request) {
  return handleReport(req);
}
