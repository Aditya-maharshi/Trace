import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/domains/core/auditLog";

export async function GET(req: Request) {
  try {
    const admin = getSupabaseAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Database service unavailable" }, { status: 500 });
    }

    const { data: queue, error } = await admin
      .from("case_history")
      .select("id, case_id, metadata, created_at")
      .eq("actor_type", "SAHYOG_QUEUE")
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to query SAHYOG queue: ${error.message}`);
    }

    return NextResponse.json(queue, { status: 200 });
  } catch (err: any) {
    console.error("[SAHYOG Queue Route] Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
