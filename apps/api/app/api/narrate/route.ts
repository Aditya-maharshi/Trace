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

    return NextResponse.json({ narrative });
  } catch (error) {
    console.error("Narrate API error:", error);
    // Downstream AI error: provide a minimal fallback instead of breaking the UI
    return NextResponse.json(
      {
        narrative: `Error analyzing risk.`,
      },
      { 
        status: 200,
      }
    );
  }
}
