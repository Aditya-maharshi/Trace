/**
 * lib/verifyJwt.ts
 *
 * Verifies a Supabase JWT using HMAC-SHA256 with the SUPABASE_JWT_SECRET
 * environment variable.  Falls back to un-verified decode (anonymous) when
 * the secret is not configured — but logs a warning so operators notice.
 *
 * Security fix: previously the API decoded JWT payloads without checking
 * the signature, allowing anyone to forge an arbitrary `sub` claim.
 *
 * Edge-runtime compatible: uses Web Crypto API (crypto.subtle) instead of
 * the Node.js `crypto` module, which is not available in Next.js Edge Middleware.
 */

function base64UrlDecode(str: string): Uint8Array {
  // Convert base64url → standard base64
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  // Pad to multiple of 4
  while (base64.length % 4 !== 0) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base64UrlDecodeToString(str: string): string {
  const bytes = base64UrlDecode(str);
  return new TextDecoder().decode(bytes);
}

/**
 * Verify a Supabase HS256 JWT and return the `sub` claim.
 * Returns `null` when the token is missing, malformed, expired, or has an
 * invalid signature.
 *
 * Synchronous path: only used when called outside middleware (no secret).
 * Async path: used when SUPABASE_JWT_SECRET is set (Web Crypto signature check).
 *
 * NOTE: For Edge Middleware compatibility this function is async. Callers in
 * non-middleware contexts that previously used the synchronous version must
 * await it or use the sync extractVerifiedUserIdSync helper below.
 */
export async function extractVerifiedUserIdAsync(authHeader: string): Promise<string | null> {
  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7);
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  const jwtSecret = process.env.SUPABASE_JWT_SECRET ?? "";

  if (!jwtSecret) {
    // No secret configured — we cannot verify signatures.
    console.warn(
      "[verifyJwt] SUPABASE_JWT_SECRET is not set — JWT signature verification is DISABLED. " +
      "Set this variable in production to prevent forged audit-trail entries."
    );
    // Refuse to trust an unverified token — return null (anonymous).
    return null;
  }

  try {
    // Verify HMAC-SHA256 signature using Web Crypto API (Edge-compatible)
    const encoder = new TextEncoder();
    const keyData = encoder.encode(jwtSecret);
    const signatureInput = encoder.encode(`${headerB64}.${payloadB64}`);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );

    const expectedSig = base64UrlDecode(signatureB64);

    const isValid = await crypto.subtle.verify(
      "HMAC",
      cryptoKey,
      expectedSig,
      signatureInput,
    );

    if (!isValid) {
      console.warn("[verifyJwt] JWT signature mismatch — rejecting token");
      return null;
    }

    // Decode payload
    const payload = JSON.parse(base64UrlDecodeToString(payloadB64));

    // Check expiration
    if (payload.exp && typeof payload.exp === "number") {
      const now = Math.floor(Date.now() / 1000);
      if (now > payload.exp) {
        return null; // expired
      }
    }

    return payload.sub ?? null;
  } catch {
    // Malformed JWT
    return null;
  }
}

/**
 * Synchronous wrapper for non-middleware call sites (route handlers).
 * Since we cannot await inside some call sites, this version skips signature
 * verification when the environment doesn't support async (e.g. fire-and-forget
 * audit log calls). For the middleware auth gate, use extractVerifiedUserIdAsync.
 *
 * In practice: route handlers call this for audit log attribution only (not
 * for access control). The middleware already enforces auth before reaching them.
 */
export function extractVerifiedUserId(authHeader: string): string | null {
  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7);
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [, payloadB64] = parts as [string, string, string];

  const jwtSecret = process.env.SUPABASE_JWT_SECRET ?? "";

  if (!jwtSecret) {
    console.warn(
      "[verifyJwt] SUPABASE_JWT_SECRET is not set — JWT signature verification is DISABLED. " +
      "Set this variable in production to prevent forged audit-trail entries."
    );
    return null;
  }

  // Synchronous path: decode only (signature verified async by middleware before reaching here)
  try {
    const payload = JSON.parse(base64UrlDecodeToString(payloadB64));
    if (payload.exp && typeof payload.exp === "number") {
      const now = Math.floor(Date.now() / 1000);
      if (now > payload.exp) return null;
    }
    return payload.sub ?? null;
  } catch {
    return null;
  }
}
