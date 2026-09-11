import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkRateLimit } from "./lib/rateLimit";

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
export async function middleware(request: NextRequest) {
  const origin = request.headers.get("origin") || "";
  const allowedOrigin = process.env.FRONTEND_URL || "*";

  // If we require an exact match and it doesn't match, we could block it,
  // but for local dev and simple setups, we'll allow the env origin or fallback.
  const responseOrigin = allowedOrigin === "*" ? origin || "*" : allowedOrigin;

  // Shared CORS headers – reused across every response path so browsers can
  // always read the body (including 401 / 429 error JSON).
  const corsHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": responseOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
    "Access-Control-Max-Age": "86400",
  };

  // -----------------------------------------------------------------------
  // 1. Preflight – exempt from auth & rate-limit (browser won't send the key
  //    on the OPTIONS request, and blocking it kills the actual request).
  // -----------------------------------------------------------------------
  if (request.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  // -----------------------------------------------------------------------
  // 2. API-key authentication
  // -----------------------------------------------------------------------
  const apiKeysEnv = process.env.API_KEYS ?? "";
  const validKeys = apiKeysEnv
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  const presentedKey = 
    request.headers.get("x-api-key") ?? 
    request.nextUrl.searchParams.get("apiKey") ?? 
    "";

  if (validKeys.length > 0) {
    // Keys are configured – enforce them.
    if (!presentedKey || !validKeys.includes(presentedKey)) {
      return NextResponse.json(
        { error: "Unauthorized. A valid x-api-key header or apiKey query parameter is required." },
        { status: 401, headers: corsHeaders },
      );
    }
  }
  // If API_KEYS is empty / unset we fall through – useful during local dev.

  // -----------------------------------------------------------------------
  // 3. Rate limiting (fixed-window counter)
  // -----------------------------------------------------------------------
  const maxReqs = Number(process.env.RATE_LIMIT_MAX) || 100;
  const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000;

  // Key by the API key when present; fall back to IP for anonymous callers.
  const rateLimitKey =
    presentedKey ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";

  const rateLimitResponse = await checkRateLimit(
    rateLimitKey,
    maxReqs,
    windowMs,
    corsHeaders,
  );
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  // -----------------------------------------------------------------------
  // 4. Existing CORS handling – untouched
  // -----------------------------------------------------------------------
  const response = NextResponse.next();
  response.headers.set("Access-Control-Allow-Origin", responseOrigin);
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-api-key",
  );

  return response;
}

// Only apply CORS to /api routes
export const config = {
  matcher: "/api/:path*",
};
