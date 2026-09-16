import { NextRequest, NextResponse } from "next/server";
import { runStripeSyncWorker } from "../../../../lib/domains/core/stripeWorker";

/**
 * POST /api/internal/sync-usage
 *
 * Vercel Cron-compatible endpoint that triggers the Stripe metered usage sync.
 * Protected by CRON_SECRET — must not be publicly accessible.
 *
 * Configure in vercel.json:
 * {
 *   "crons": [{ "path": "/api/internal/sync-usage", "schedule": "0 * * * *" }]
 * }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Verify the caller is Vercel Cron or an authorized internal service
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runStripeSyncWorker();
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error("[sync-usage] Stripe sync worker failed:", err);
    return NextResponse.json({ error: "Internal error during sync" }, { status: 500 });
  }
}
