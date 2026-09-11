import { NextResponse } from "next/server";
import { getMethodologyDisclosure } from "../../../lib/methodology";

export async function GET() {
  const disclosure = getMethodologyDisclosure();
  return NextResponse.json(disclosure);
}
