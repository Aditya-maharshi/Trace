import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkRateLimit, parseApiKeyLists, resolveRateLimitIdentity } from "./lib/domains/auth/rateLimit";
import { extractVerifiedUserIdAsync } from "./lib/domains/auth/verifyJwt";
import { canonicalApiPath, withApiVersionHeaders } from "./lib/domains/core/apiVersion";

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
export async function middleware(request: NextRequest) {
  const origin = request.headers.get("origin") || "";
  const isProduction = process.env.NODE_ENV === "production";

  // ── CORS origin resolution ────────────────────────────────────────────────
  // In production, FRONTEND_URL must be set — no wildcard fallback.
  // In dev, fall back to "*" for convenience.
  const configuredOrigin = process.env.FRONTEND_URL || "";
  let responseOrigin: string;

  if (configuredOrigin) {
    // Only allow the exact configured origin (strict match)
    responseOrigin = origin === configuredOrigin ? configuredOrigin : "";
  } else if (isProduction) {
    // Production with no FRONTEND_URL — block cross-origin browser requests
    console.error(
      "[middleware] CRITICAL: FRONTEND_URL is not set in production. " +
      "CORS will block all browser cross-origin requests."
    );
    responseOrigin = "";
  } else {
    // Dev mode — permissive
    responseOrigin = origin || "*";
  }

  // Shared CORS headers – reused across every response path so browsers can
  // always read the body (including 401 / 429 error JSON).
  const corsHeaders: Record<string, string> = withApiVersionHeaders({
    ...(responseOrigin ? { "Access-Control-Allow-Origin": responseOrigin } : {}),
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
    "Access-Control-Max-Age": "86400",
  });

  // -----------------------------------------------------------------------
  // 0. Auto-relay to Frontend if an OAuth callback landed on the API server
  // -----------------------------------------------------------------------
  const pathname = request.nextUrl.pathname;
  if (!pathname.startsWith("/api") && !pathname.startsWith("/_next") && pathname !== "/favicon.ico") {
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:8083";
    const targetUrl = new URL(pathname + request.nextUrl.search, frontendUrl);
    return NextResponse.redirect(targetUrl);
  }

  // -----------------------------------------------------------------------
  // 1. Preflight – exempt from auth & rate-limit
  // -----------------------------------------------------------------------
  if (request.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  // -----------------------------------------------------------------------
  // 2. API-key authentication (public endpoints exempt)
  // -----------------------------------------------------------------------
  const apiPath = canonicalApiPath(pathname);
  const isPublicRoute =
    apiPath === "/api/prices" ||
    apiPath === "/api/health" ||
    apiPath === "/api/docs" ||
    apiPath === "/api/methodology" ||
    apiPath === "/api/mcp";

  let apiContext = null;
  const authHeader = request.headers.get("authorization");
  
  if (!isPublicRoute) {
    let presentedKey = request.headers.get("x-api-key") ?? request.nextUrl.searchParams.get("apiKey") ?? "";
    if (!presentedKey && authHeader && authHeader.startsWith("Bearer trace_live_sk_")) {
        presentedKey = authHeader.replace("Bearer ", "");
    }
    if (!presentedKey && authHeader && authHeader.startsWith("Bearer trace_test_sk_")) {
        presentedKey = authHeader.replace("Bearer ", "");
    }

    if (!presentedKey) {
        // Fall back to guest session / early JWT check if applicable
        const earlyUserId = await extractVerifiedUserIdAsync(authHeader || "");
        const isDemoMode = process.env.DEMO_MODE === "true";
        if (!earlyUserId && !isDemoMode) {
          return NextResponse.json(
            { error: "Unauthorized. A valid API Key or Supabase session is required." },
            { status: 401, headers: corsHeaders }
          );
        }
    } else {
       // First check: is this key in the simple env-based allow-list (API_KEYS)?
       // These are pre-approved keys that don't require a DB row.
       const { parseApiKeyLists } = await import('./lib/domains/auth/rateLimit');
       const { validKeys } = parseApiKeyLists();
       if (validKeys.includes(presentedKey)) {
         // Env-based key is valid — no DB lookup needed. apiContext remains null
         // (no org/tenant), which means guest-tier rate limits apply.
       } else {
         // Fall through to multi-tenant DB resolver for trace_live_sk_ / trace_test_sk_ keys
         const { resolveAndValidateApiKey } = await import('./lib/domains/auth/authKey');
         const authResult = await resolveAndValidateApiKey(presentedKey, pathname);
         if (authResult.error) {
            return NextResponse.json(
              { error: authResult.error },
              { status: authResult.status || 401, headers: corsHeaders }
            );
         }
         apiContext = authResult.context;
       }
    }
  }

  // -----------------------------------------------------------------------
  // 3. Rate limiting and Quota (tier-isolated fixed-window counters)
  // -----------------------------------------------------------------------
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  
  // If we have an API context (multi-tenant), use that for rate limit identity
  const identityKey = apiContext ? `org:${apiContext.org_id}` : `guest:${ip}`;
  const maxReqs = apiContext ? (Number(process.env.RATE_LIMIT_PAID_MAX) || 300) : (Number(process.env.RATE_LIMIT_GUEST_MAX) || 30);
  const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000;

  const rateLimitResponse = await checkRateLimit(
    identityKey,
    maxReqs,
    windowMs,
    corsHeaders,
  );

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  // Quota checking for paid tiers
  if (apiContext) {
      const { checkUsageQuota } = await import('./lib/domains/auth/rateLimit');
      const quotaResponse = await checkUsageQuota(
          apiContext.org_id, 
          apiContext.overage_policy,
          corsHeaders
      );
      if (quotaResponse) {
          return quotaResponse;
      }
  }

  // -----------------------------------------------------------------------
  // 4. Apply CORS headers to the passthrough response
  // -----------------------------------------------------------------------
  const response = NextResponse.next();
  if (apiContext) {
      response.headers.set('x-tenant-org-id', apiContext.org_id);
      response.headers.set('x-tenant-scopes', JSON.stringify(apiContext.scopes));
      response.headers.set('x-tenant-env', apiContext.key_env);
  }
  
  if (responseOrigin) {
    response.headers.set("Access-Control-Allow-Origin", responseOrigin);
  }
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-api-key",
  );
  response.headers.set("X-API-Version", "1");

  return response;
}

// Match all requests except internal Next.js static assets so that OAuth callbacks
// landing on the API server (e.g. localhost:3000/dashboard) are redirected to the frontend
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
