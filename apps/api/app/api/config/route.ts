import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    isDemoMode: process.env.DEMO_MODE === "true",
  });
}
