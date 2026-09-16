/**
 * lib/auditLog.ts
 *
 * Non-blocking audit trail logger for VASP attribution lookups.
 * Writes to the `lookups` table in Supabase using the service-role key.
 *
 * ─── DESIGN DECISIONS ────────────────────────────────────────────────────────
 *
 * 1. **Fire-and-forget**: The insert is awaited internally but the caller
 *    should `.catch(() => {})` the returned promise. A failed audit write
 *    must NEVER turn into a user-facing 500.
 *
 * 2. **Anonymous requests are NOT logged**: If there is no authenticated
 *    user_id, we skip the Supabase insert entirely. Anonymous traffic is
 *    counted via an in-memory counter for abuse monitoring, but not
 *    attributed to a user row that doesn't exist.
 *
 * 3. **Service-role key**: Bypasses RLS so the backend can insert without
 *    a user JWT. The key must be in SUPABASE_SERVICE_ROLE_KEY env var.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { hashIp } from "../core/logger";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export interface LookupLogEntry {
  /** Supabase auth user_id. Null for anonymous / demo-key callers. */
  userId: string | null;
  /** The Ethereum address that was queried. */
  queriedAddress: string;
  /** Nearest VASP found (null if none). */
  nearestVasp: string | null;
  /** Confidence tier. */
  confidence: string | null;
  /** Risk level. */
  risk: string | null;
  /** Full AttributionResponse object (stored as JSONB). */
  rawResponse: Record<string, unknown>;
  /** Client IP address — hashed before insert, never stored plaintext. */
  ipAddress: string | null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Anonymous counter (in-memory, for abuse monitoring)
// ──────────────────────────────────────────────────────────────────────────────

let anonymousLookupCount = 0;

/** Returns the current anonymous lookup count (for monitoring endpoints). */
export function getAnonymousLookupCount(): number {
  return anonymousLookupCount;
}

// ──────────────────────────────────────────────────────────────────────────────
// Supabase client (lazy-initialized)
// ──────────────────────────────────────────────────────────────────────────────

let supabaseAdmin: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient | null {
  if (supabaseAdmin) return supabaseAdmin;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    console.warn(
      "[auditLog] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — audit logging disabled.",
    );
    return null;
  }

  supabaseAdmin = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabaseAdmin;
}

// ──────────────────────────────────────────────────────────────────────────────
// Core logging function
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Log a lookup to the `lookups` audit table.
 *
 * - If `userId` is null (anonymous/demo), increments the anonymous counter
 *   but does NOT write to Supabase.
 * - If Supabase credentials are missing, logs a warning and returns.
 * - On insert failure, logs the error but never throws.
 */
export async function logLookup(entry: LookupLogEntry): Promise<void> {
  // Anonymous callers: count but don't log to DB
  if (!entry.userId) {
    anonymousLookupCount++;
    return;
  }

  const client = getSupabaseAdmin();
  if (!client) return;

  try {
    const { error } = await client.from("lookups").insert({
      user_id: entry.userId,
      queried_address: entry.queriedAddress,
      nearest_vasp: entry.nearestVasp,
      confidence: entry.confidence,
      risk: entry.risk,
      raw_response: entry.rawResponse,
      ip_address: hashIp(entry.ipAddress),
      // requested_at defaults to now() in the DB
    });

    if (error) {
      console.warn("[auditLog] Failed to insert lookup:", error.message);
    }
  } catch (err) {
    console.warn("[auditLog] Unexpected error during insert:", err);
  }
}
