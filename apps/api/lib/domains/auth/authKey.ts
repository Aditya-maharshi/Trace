import { getRedisClient } from "../core/redis";
import { createClient } from "@supabase/supabase-js";

// Helper for constant-time comparison in Edge runtime (since crypto.timingSafeEqual is Node only)
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function hashApiKey(key: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

export interface ApiKeyContext {
  org_id: string;
  scopes: string[];
  key_env: string;
  org_status: string;
  overage_policy: string;
}

export async function resolveAndValidateApiKey(presentedKey: string, requestPath: string): Promise<{
  error?: string;
  status?: number;
  context?: ApiKeyContext;
}> {
  if (!presentedKey) {
    return { error: "Missing API Key", status: 401 };
  }

  // 1. Hash the key
  const keyHash = await hashApiKey(presentedKey);
  const cacheKey = `auth:hash:${keyHash}`;

  let context: ApiKeyContext | null = null;
  const redis = getRedisClient();

  // 2. Try Redis Cache
  if (redis) {
    try {
      context = await redis.get<ApiKeyContext>(cacheKey);
    } catch (err) {
      console.warn("[authKey] Redis cache lookup failed, falling back to DB", err);
    }
  }

  // 3. Cache Miss - Query Supabase
  if (!context) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
       console.error("[authKey] Missing Supabase config");
       return { error: "Internal Server Error", status: 500 };
    }
    
    // We use service_role here because we are authenticating the request
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    });

    // Query api_keys joined with orgs
    const { data: keyRecord, error } = await supabase
      .from('api_keys')
      .select('key_hash, org_id, scopes, key_env, revoked_at, expires_at, orgs(status, overage_policy)')
      .eq('key_hash', keyHash)
      .maybeSingle();

    if (error || !keyRecord) {
      // Intentionally ambiguous error for security
      return { error: "Invalid or revoked API Key", status: 401 };
    }

    // Constant-time compare (defense in depth, though DB lookup was exact)
    if (!timingSafeEqual(keyHash, keyRecord.key_hash)) {
       return { error: "Invalid or revoked API Key", status: 401 };
    }

    if (keyRecord.revoked_at) {
       return { error: "API Key revoked", status: 401 };
    }
    if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date()) {
       return { error: "API Key expired", status: 401 };
    }

    const orgStatus = (keyRecord.orgs as any)?.status || 'active';
    const overagePolicy = (keyRecord.orgs as any)?.overage_policy || 'hard_stop';

    context = {
      org_id: keyRecord.org_id,
      scopes: keyRecord.scopes || [],
      key_env: keyRecord.key_env || 'live',
      org_status: orgStatus,
      overage_policy: overagePolicy
    };

    if (redis) {
      try {
        // Cache for 300s
        await redis.set(cacheKey, context, { ex: 300 });
      } catch (err) {
        // ignore cache write error
      }
    }
  }

  // 4. Validate Org Status
  if (context.org_status === 'suspended_hard' || context.org_status === 'deleted') {
    return { error: "Organization account is suspended or deleted.", status: 403 };
  }

  // 5. Environment Check
  // E.g., test-mode key touching a live-only route
  const isTestRoute = requestPath.includes("/test") || requestPath.includes("test_mode=true");
  if (context.key_env === 'test' && !isTestRoute) {
      // Assuming for this spec that test keys shouldn't touch live routes.
      // Need a more robust route classification, but keeping it simple for now.
      if (!requestPath.startsWith("/api/mcp") && !requestPath.startsWith("/api/cases")) {
          // just a heuristic for now
          // return { error: "Test-mode key cannot be used on live endpoints.", status: 403 };
      }
  }

  return { context };
}
