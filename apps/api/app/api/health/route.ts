import { NextResponse } from "next/server";
import { getRedisClient } from "../../../lib/redis";
import { getSupabaseAdmin } from "../../../lib/auditLog";

export async function GET() {
  const status: Record<string, "ok" | "failed" | "unconfigured"> = {};
  const details: Record<string, string> = {};

  // Etherscan Check
  try {
    const res = await fetch(`https://api.etherscan.io/api?module=proxy&action=eth_blockNumber&apikey=${process.env.ETHERSCAN_API_KEY || ""}`);
    if (res.ok) {
      status.etherscan = "ok";
    } else {
      status.etherscan = "failed";
      details.etherscan = `HTTP ${res.status}`;
    }
  } catch (err) {
    status.etherscan = "failed";
    details.etherscan = String(err);
  }

  // Blockscout Check
  try {
    const res = await fetch(`https://eth.blockscout.com/api/v2/blocks`);
    if (res.ok) {
      status.blockscout = "ok";
    } else {
      status.blockscout = "failed";
      details.blockscout = `HTTP ${res.status}`;
    }
  } catch (err) {
    status.blockscout = "failed";
    details.blockscout = String(err);
  }

  // OpenSanctions Check
  try {
    const res = await fetch("https://api.opensanctions.org/match/default");
    // Even if it returns 400 (Bad Request without query params), the endpoint is reachable.
    if (res.status !== 500 && res.status !== 502) {
      status.opensanctions = "ok";
    } else {
      status.opensanctions = "failed";
      details.opensanctions = `HTTP ${res.status}`;
    }
  } catch (err) {
    status.opensanctions = "failed";
    details.opensanctions = String(err);
  }

  // Redis Check
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.ping();
      status.redis = "ok";
    } catch (err) {
      status.redis = "failed";
      details.redis = String(err);
    }
  } else {
    status.redis = "unconfigured";
  }

  // Supabase Check
  const supabase = getSupabaseAdmin();
  if (supabase) {
    try {
      // Just fetch 1 row from any common table or just hit the health endpoint
      const { error } = await supabase.from("lookups").select("id").limit(1);
      if (error) {
        status.supabase = "failed";
        details.supabase = error.message;
      } else {
        status.supabase = "ok";
      }
    } catch (err) {
      status.supabase = "failed";
      details.supabase = String(err);
    }
  } else {
    status.supabase = "unconfigured";
  }

  const allOk = Object.values(status).every(s => s === "ok" || s === "unconfigured");

  return NextResponse.json({
    healthy: allOk,
    timestamp: new Date().toISOString(),
    status,
    details: Object.keys(details).length > 0 ? details : undefined
  }, { status: allOk ? 200 : 503 });
}
