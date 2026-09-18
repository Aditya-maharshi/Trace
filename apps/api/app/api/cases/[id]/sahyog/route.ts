import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../../lib/domains/core/auditLog";
import { loadAttributionResult } from "../../../../../lib/domains/core/resultStore";
import { computePayloadHash } from "../../../../../lib/domains/cases/caseStore";
import { compileSahyogPayload, StubSahyogAdapter } from "../../../../../lib/domains/compliance/sahyogAdapter";

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
        { error: "SAHYOG payload can only be generated for onshore (domestic) registered VASPs." },
        { status: 403 }
      );
    }

    // Role-based check
    const scopesHeader = req.headers.get("x-tenant-scopes");
    if (scopesHeader) {
      try {
        const scopes = JSON.parse(scopesHeader);
        if (!scopes.includes("investigator") && !scopes.includes("officer")) {
          return NextResponse.json({ error: "Forbidden: investigator or officer role required to draft legal instruments" }, { status: 403 });
        }
      } catch (e) {}
    }

    const payloadHash = computePayloadHash(stored);
    const sahyogPayload = compileSahyogPayload(stored, caseId, payloadHash);
    
    const adapter = new StubSahyogAdapter();
    const result = await adapter.dispatchRequest(sahyogPayload);

    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    console.error("[SAHYOG Dispatch Route] Error:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}
