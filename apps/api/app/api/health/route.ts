import { NextResponse } from "next/server";
import { getRedisClient } from "../../../lib/domains/core/redis";
import { getSupabaseAdmin } from "../../../lib/domains/core/auditLog";

export async function GET() {
  const status: Record<string, "ok" | "failed" | "unconfigured"> = {};

  // Etherscan Check
  try {
    const res = await fetch(`https://api.etherscan.io/v2/api?chainid=1&module=proxy&action=eth_blockNumber&apikey=${process.env.ETHERSCAN_API_KEY || ""}`);
    status.etherscan = res.ok ? "ok" : "failed";
  } catch {
    status.etherscan = "failed";
  }

  // Blockscout Check
  try {
    const res = await fetch(`https://eth.blockscout.com/api/v2/blocks`);
    status.blockscout = res.ok ? "ok" : "failed";
  } catch {
    status.blockscout = "failed";
  }

  // OpenSanctions Check
  try {
    const res = await fetch("https://api.opensanctions.org/match/default");
    // Even if it returns 400 (Bad Request without query params), the endpoint is reachable.
    status.opensanctions = res.status !== 500 && res.status !== 502 ? "ok" : "failed";
  } catch {
    status.opensanctions = "failed";
  }

  // Redis Check
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.ping();
      status.redis = "ok";
    } catch {
      status.redis = "failed";
    }
  } else {
    status.redis = "unconfigured";
  }

  // Supabase Check
  const supabase = getSupabaseAdmin();
  if (supabase) {
    try {
      const { error } = await supabase.from("lookups").select("id").limit(1);
      status.supabase = error ? "failed" : "ok";
    } catch {
      status.supabase = "failed";
    }
  } else {
    status.supabase = "unconfigured";
  }

  const allOk = Object.values(status).every(s => s === "ok" || s === "unconfigured");

  // Public probe only reports liveness. Dependency names and error text stay internal.
  return NextResponse.json(
    {
      healthy: allOk,
      timestamp: new Date().toISOString(),
    },
    { status: allOk ? 200 : 503 },
  );
}
