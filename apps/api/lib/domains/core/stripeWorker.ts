/**
 * lib/stripeWorker.ts
 *
 * Idempotent Stripe Metered Usage sync worker.
 *
 * Design guarantees:
 * 1. Reads from durable `usage_events` table — never Redis alone.
 * 2. Uses {org_id}:{lookup_id} as the Stripe idempotency key.
 * 3. Marks synced_to_stripe_at PER EVENT as confirmations arrive — not
 *    as an all-or-nothing batch — so partial batch failures don't force
 *    a full batch replay.
 * 4. Runs as a Vercel Cron-compatible API handler (stateless, idempotent).
 *
 * Invocation: POST /api/internal/sync-usage (protected by CRON_SECRET header)
 */

import { createClient } from "@supabase/supabase-js";

// We use service role here since this worker operates across all orgs.
// This is an explicitly audited service-role use case.
function getAdminClient() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

interface UsageEvent {
  id: string;
  org_id: string;
  lookup_id: string;
  event_type: string;
  occurred_at: string;
}

const BATCH_SIZE = 50;
const STRIPE_METERED_USAGE_URL = "https://api.stripe.com/v1/subscription_items";

/**
 * Fetches the Stripe subscription item ID for a given org.
 * In production this would be stored in the `orgs` table (stripe_subscription_item_id).
 */
async function getStripeSubscriptionItemId(orgId: string): Promise<string | null> {
  const db = getAdminClient();
  const { data } = await db
    .from("orgs")
    .select("stripe_subscription_item_id")
    .eq("id", orgId)
    .maybeSingle();
  return (data as any)?.stripe_subscription_item_id || null;
}

/**
 * Report a single usage event to Stripe Metered Billing API.
 * Uses {org_id}:{lookup_id} as the idempotency key so re-submission is safe.
 */
async function reportToStripe(
  subscriptionItemId: string,
  event: UsageEvent,
): Promise<{ success: boolean; error?: string }> {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    return { success: false, error: "STRIPE_SECRET_KEY not configured" };
  }

  const idempotencyKey = `${event.org_id}:${event.lookup_id}`;
  const timestamp = Math.floor(new Date(event.occurred_at).getTime() / 1000);

  const body = new URLSearchParams({
    quantity: "1",
    timestamp: String(timestamp),
    action: "increment",
  });

  try {
    const res = await fetch(`${STRIPE_METERED_USAGE_URL}/${subscriptionItemId}/usage_records`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": idempotencyKey,
      },
      body: body.toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: `Stripe API ${res.status}: ${text}` };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Mark a single usage event as synced in the DB.
 * Called immediately after a successful Stripe confirmation — not batched.
 */
async function markEventSynced(eventId: string): Promise<void> {
  const db = getAdminClient();
  const { error } = await db
    .from("usage_events")
    .update({ synced_to_stripe_at: new Date().toISOString() })
    .eq("id", eventId);

  if (error) {
    console.error(`[stripeWorker] Failed to mark event ${eventId} as synced:`, error.message);
  }
}

export interface SyncResult {
  processed: number;
  succeeded: number;
  failed: number;
  errors: { eventId: string; error: string }[];
}

/**
 * Main sync worker entry point.
 * Reads unsynced usage events in batches, reports each to Stripe,
 * and marks them individually as synced on success.
 */
export async function runStripeSyncWorker(): Promise<SyncResult> {
  const db = getAdminClient();
  const result: SyncResult = { processed: 0, succeeded: 0, failed: 0, errors: [] };

  // Group unsynced events by org to batch Stripe subscription item lookups
  const { data: events, error } = await db
    .from("usage_events")
    .select("id, org_id, lookup_id, event_type, occurred_at")
    .is("synced_to_stripe_at", null)
    .order("occurred_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    console.error("[stripeWorker] Failed to fetch unsynced events:", error.message);
    return result;
  }

  if (!events || events.length === 0) {
    return result;
  }

  // Cache subscription item IDs per org to avoid repeated lookups
  const subscriptionItemCache = new Map<string, string | null>();

  for (const event of events as UsageEvent[]) {
    result.processed++;

    if (!subscriptionItemCache.has(event.org_id)) {
      const itemId = await getStripeSubscriptionItemId(event.org_id);
      subscriptionItemCache.set(event.org_id, itemId);
    }

    const subscriptionItemId = subscriptionItemCache.get(event.org_id);
    if (!subscriptionItemId) {
      // Org might be on a free tier with no Stripe subscription — skip silently
      result.failed++;
      result.errors.push({ eventId: event.id, error: "No Stripe subscription item for org" });
      continue;
    }

    const { success, error: stripeErr } = await reportToStripe(subscriptionItemId, event);

    if (success) {
      // Critical: mark synced immediately, not at end of batch
      await markEventSynced(event.id);
      result.succeeded++;
    } else {
      result.failed++;
      result.errors.push({ eventId: event.id, error: stripeErr || "Unknown Stripe error" });
      console.error(`[stripeWorker] Failed to sync event ${event.id}:`, stripeErr);
    }
  }

  console.log(
    `[stripeWorker] Sync complete: ${result.succeeded} succeeded, ${result.failed} failed of ${result.processed} processed`,
  );

  return result;
}
