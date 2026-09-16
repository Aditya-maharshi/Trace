import { generateRiskNarrative } from "../../../lib/domains/ai/gemini";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid or malformed JSON payload" },
      { status: 400 }
    );
  }

  try {
    const { wallet, nearestVasp, hops, confidence, score, risk } = body || {};

    if (!wallet || !nearestVasp) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const narrative = await generateRiskNarrative({
      wallet,
      nearestVasp,
      hops,
      confidence,
      score,
      risk,
    });

    const origin = req.headers.get("origin") || "*";
    return NextResponse.json({ narrative }, {
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
      }
    });
  } catch (error) {
    console.error("Narrate API error:", error);
    // Downstream AI error: provide a minimal fallback instead of breaking the UI
    const origin = req.headers.get("origin") || "*";
    return NextResponse.json(
      {
        narrative: `Error analyzing risk.`,
      },
      { 
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
        }
      }
    );
  }
}
