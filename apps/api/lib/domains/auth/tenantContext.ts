import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * lib/tenantContext.ts
 *
 * Provides a transaction-scoped RLS context for all tenant-scoped DB queries.
 *
 * The critical correctness guarantee here:
 *   SET LOCAL app.current_org_id = '<uuid>'
 * is scoped to the *current transaction only*. The Supabase client is used in
 * transaction mode (or each request opens a fresh connection), so this value
 * can never leak across requests or pooled connections from different tenants.
 *
 * This is the single most important isolation primitive in this architecture.
 * Every domain-layer DB call that touches tenant data MUST go through here.
 */

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Returns a Supabase service-role client.
 * Service role bypasses RLS — therefore its use is intentional here:
 * we set the RLS context ourselves via SET LOCAL, so RLS still applies
 * on the *policies*, just driven by our app-level org_id session variable
 * rather than the JWT claim.
 *
 * Any use of this client MUST be wrapped in withTenantTransaction().
 */
function getServiceClient(): SupabaseClient {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
    db: { schema: "public" },
  });
}

/**
 * Execute a block of DB queries within a transaction that is RLS-scoped to
 * a single tenant org.
 *
 * Execution flow:
 *   BEGIN;
 *   SET LOCAL app.current_org_id = '<orgId>';
 *   -- all queries inside `callback` run here, filtered by RLS policies --
 *   COMMIT; (or ROLLBACK on error)
 *
 * @param orgId    - The tenant org UUID to scope this transaction to.
 * @param callback - An async function that receives a Supabase client and
 *                   executes domain queries within the transaction.
 * @returns          Whatever the callback returns.
 * @throws           If the transaction or any query fails.
 */
export async function withTenantTransaction<T>(
  orgId: string,
  callback: (db: SupabaseClient) => Promise<T>,
): Promise<T> {
  const db = getServiceClient();

  // Begin explicit transaction
  const { error: beginError } = await db.rpc("begin_transaction");
  if (beginError) {
    throw new Error(`[tenantContext] Failed to begin transaction: ${beginError.message}`);
  }

  try {
    // Scope RLS to this org for the duration of this transaction
    const { error: setError } = await db.rpc("set_tenant_context", { p_org_id: orgId });
    if (setError) {
      throw new Error(`[tenantContext] Failed to set tenant context: ${setError.message}`);
    }

    // Execute domain logic
    const result = await callback(db);

    // Commit
    const { error: commitError } = await db.rpc("commit_transaction");
    if (commitError) {
      throw new Error(`[tenantContext] Failed to commit transaction: ${commitError.message}`);
    }

    return result;
  } catch (err) {
    // Rollback on any failure
    try {
      await db.rpc("rollback_transaction");
    } catch (rollbackErr) {
      console.error("[tenantContext] CRITICAL: Rollback failed:", rollbackErr);
    }
    throw err;
  }
}

/**
 * Increment the fast-gate Redis usage counter for an org after a successful event.
 * This is called *after* the durable usage_events row has been written.
 * If Redis is unavailable, we log a warning and continue — the durable record
 * in usage_events is the source of truth and can be used to reconcile Redis.
 */
export async function incrementUsageCounter(orgId: string): Promise<void> {
  try {
    const { getRedisClient } = await import("../core/redis");
    const redis = getRedisClient();
    if (!redis) return;

    const date = new Date();
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const redisKey = `usage:${orgId}:${monthKey}`;

    await redis.incr(redisKey);
    // Set a 35-day TTL to ensure monthly counters auto-expire
    await redis.expire(redisKey, 35 * 24 * 60 * 60);
  } catch (err) {
    console.warn(`[tenantContext] Failed to increment usage counter for org ${orgId}:`, err);
  }
}

/**
 * Durably record a usage event in the DB, then increment the fast Redis counter.
 * Write order is critical: durable record first, Redis second.
 * A crash between them leaves only a Redis inconsistency that reconciliation can fix,
 * not a lost billing event.
 */
export async function recordUsageEvent(
  orgId: string,
  lookupId: string,
  eventType: string,
): Promise<void> {
  const db = getServiceClient();

  const { error } = await db.from("usage_events").insert({
    org_id: orgId,
    lookup_id: lookupId,
    event_type: eventType,
  });

  if (error) {
    // Log but don't throw — billing failure should never block the user's response
    console.error(`[tenantContext] Failed to record usage event for org ${orgId}:`, error.message);
    return;
  }

  // Now safe to increment Redis
  await incrementUsageCounter(orgId);
}
