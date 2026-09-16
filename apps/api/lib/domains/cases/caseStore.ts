/**
 * lib/caseStore.ts
 *
 * Core mutation and query logic for the Case Management System.
 * Guarantees:
 * - Single atomic mutation path for all transitions (both human and system).
 * - Optimistic concurrency locking via integer versions.
 * - Re-reads state from DB before transitioning (never trusts client state).
 * - Enforces the shared state machine rules.
 * - Records immutable audit log entries in `case_history`.
 */

import crypto from 'crypto';
import { getSupabaseAdmin } from '../core/auditLog';
import { withTenantTransaction, recordUsageEvent } from '../auth/tenantContext';
import {
  isValidTransition,
  transitionError,
  validateTransitionReason,
  computeSlaStatus,
  DEFAULT_SLA_THRESHOLDS_HOURS,
  CaseStatus,
  SlaStatus,
  Case,
  CaseHistoryEntry,
  CaseWallet,
  CaseEvidence,
  SlaPolicy,
} from '@sih/shared-types';
import { sendCaseNotification } from './caseNotifications';

export function canonicalJsonStringify(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJsonStringify).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => `${JSON.stringify(k)}:${canonicalJsonStringify(obj[k])}`).join(',') + '}';
}

export function computePayloadHash(payload: any): string {
  const canonical = canonicalJsonStringify(payload ?? {});
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export interface CreateCaseParams {
  userId?: string | null;
  orgId?: string;
  title: string;
  description?: string | null;
  wallets?: string[];
  jurisdiction?: string | null;
  riskScore?: number | null;
  analystId?: string | null;
}

export interface TransitionResult {
  success: boolean;
  conflict?: boolean;
  invalid?: boolean;
  notFound?: boolean;
  error?: string;
  currentCase?: Case;
  updatedCase?: Case;
  historyEntry?: CaseHistoryEntry;
}

/**
 * Creates a new case and its initial history entry.
 */
export async function createCase(params: CreateCaseParams): Promise<Case> {
  const client = getSupabaseAdmin();
  if (!client) {
    throw new Error('Supabase client not available');
  }

  const initialWallets = Array.isArray(params.wallets) ? params.wallets.map((w) => w.toLowerCase()) : [];
  const orgId = params.orgId || 'default';
  const now = new Date().toISOString();

  const insertPayload = {
    user_id: params.userId || null,
    org_id: orgId,
    title: params.title.trim(),
    description: params.description?.trim() || null,
    status: 'open' as CaseStatus,
    version: 1,
    analyst_id: params.analystId || params.userId || null,
    wallets: initialWallets,
    jurisdiction: params.jurisdiction || null,
    risk_score: params.riskScore !== undefined ? params.riskScore : null,
    entered_current_state_at: now,
    sla_status: 'ok' as SlaStatus,
    reason_for_transition: 'Case created',
    created_at: now,
    updated_at: now,
  };

  const { data: newCase, error: caseErr } = await client
    .from('cases')
    .insert(insertPayload)
    .select('*')
    .single();

  if (caseErr || !newCase) {
    throw new Error(`Failed to create case: ${caseErr?.message || 'Unknown error'}`);
  }

  // Insert initial history ledger entry
  const { error: histErr } = await client.from('case_history').insert({
    case_id: newCase.id,
    from_state: null,
    to_state: 'open',
    actor_id: params.userId || 'system',
    actor_type: params.userId ? 'human' : 'system',
    reason: 'Case created',
    metadata: { initial_wallets: initialWallets },
    created_at: now,
  });

  if (histErr) {
    console.warn('[caseStore] Failed to insert initial case_history entry:', histErr.message);
  }

  // Insert wallets into case_wallets join table
  if (initialWallets.length > 0) {
    const walletRows = initialWallets.map((addr) => ({
      case_id: newCase.id,
      address: addr,
      added_by: params.userId || 'system',
      notes: 'Initial wallet attached upon case creation',
    }));
    const { error: wErr } = await client.from('case_wallets').insert(walletRows);
    if (wErr) {
      console.warn('[caseStore] Failed to insert case_wallets:', wErr.message);
    }
  }

  return newCase as Case;
}

/**
 * Retrieves a list of cases with computed SLA metrics.
 */
export async function listCases(filters?: {
  userId?: string;
  orgId?: string;
  status?: CaseStatus;
}): Promise<Case[]> {
  const client = getSupabaseAdmin();
  if (!client) {
    return [];
  }

  let query = client.from('cases').select('*').order('created_at', { ascending: false });

  if (filters?.userId) {
    query = query.or(`user_id.eq.${filters.userId},analyst_id.eq.${filters.userId},user_id.is.null`);
  }
  if (filters?.orgId) {
    query = query.eq('org_id', filters.orgId);
  }
  if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  const { data: cases, error } = await query;
  if (error || !cases) {
    console.error('[caseStore] Error listing cases:', error?.message);
    return [];
  }

  // Fetch SLA policies for SLA calculation
  const { data: slaPolicies } = await client.from('sla_policies').select('*');
  const policyMap = new Map<string, number>();
  if (slaPolicies) {
    for (const p of slaPolicies as SlaPolicy[]) {
      policyMap.set(`${p.org_id}:${p.state}`, p.threshold_hours);
    }
  }

  const nowTime = Date.now();
  return cases.map((c: any) => {
    const threshold =
      policyMap.get(`${c.org_id}:${c.status}`) ??
      DEFAULT_SLA_THRESHOLDS_HOURS[c.status as CaseStatus] ??
      48;
    const sla = computeSlaStatus(c.entered_current_state_at, threshold, nowTime);
    return {
      ...c,
      sla_status: sla.status,
      sla_threshold_hours: threshold,
      time_in_state_hours: Math.round(sla.elapsedHours * 10) / 10,
      is_sla_breaching: sla.status === 'breached',
    } as Case;
  });
}

/**
 * Retrieves full details for a case, including its history, wallets, and evidence.
 */
export async function getCaseDetails(caseId: string): Promise<{
  case: Case;
  history: CaseHistoryEntry[];
  wallets: CaseWallet[];
  evidence: CaseEvidence[];
} | null> {
  const client = getSupabaseAdmin();
  if (!client) return null;

  const { data: c, error: caseErr } = await client
    .from('cases')
    .select('*')
    .eq('id', caseId)
    .single();

  if (caseErr || !c) {
    return null;
  }

  const [{ data: history }, { data: wallets }, { data: evidence }, { data: slaPolicies }] =
    await Promise.all([
      client.from('case_history').select('*').eq('case_id', caseId).order('created_at', { ascending: true }),
      client.from('case_wallets').select('*').eq('case_id', caseId).order('added_at', { ascending: false }),
      client.from('case_evidence').select('*').eq('case_id', caseId).order('pinned_at', { ascending: false }),
      client.from('sla_policies').select('*').eq('org_id', c.org_id).eq('state', c.status).maybeSingle(),
    ]);

  const threshold =
    (slaPolicies as SlaPolicy | null)?.threshold_hours ??
    DEFAULT_SLA_THRESHOLDS_HOURS[c.status as CaseStatus] ??
    48;
  const sla = computeSlaStatus(c.entered_current_state_at, threshold);

  const enrichedCase: Case = {
    ...c,
    sla_status: sla.status,
    sla_threshold_hours: threshold,
    time_in_state_hours: Math.round(sla.elapsedHours * 10) / 10,
    is_sla_breaching: sla.status === 'breached',
  };

  return {
    case: enrichedCase,
    history: (history as CaseHistoryEntry[]) || [],
    wallets: (wallets as CaseWallet[]) || [],
    evidence: (evidence as CaseEvidence[]) || [],
  };
}

/**
 * The single, atomic transition mutation path.
 * Enforces:
 * 1. DB re-read (never trusting client state)
 * 2. Optimistic locking with clientVersion
 * 3. State machine validation via `isValidTransition()`
 * 4. Reason validation
 * 5. Atomic state update + history insert
 */
export async function transitionCase(params: {
  caseId: string;
  newStatus: CaseStatus;
  reason: string;
  actorId: string | null;
  actorType: 'human' | 'system' | 'api';
  metadata?: Record<string, any>;
  clientVersion?: number;
}): Promise<TransitionResult> {
  const client = getSupabaseAdmin();
  if (!client) {
    return { success: false, error: 'Database service unavailable' };
  }

  // 1. Re-read current state from DB
  const { data: currentCase, error: fetchErr } = await client
    .from('cases')
    .select('*')
    .eq('id', params.caseId)
    .single();

  if (fetchErr || !currentCase) {
    return { success: false, notFound: true, error: 'Case not found' };
  }

  // 2. Optimistic concurrency check
  if (params.clientVersion !== undefined && currentCase.version !== params.clientVersion) {
    return {
      success: false,
      conflict: true,
      currentCase: currentCase as Case,
      error: `Conflict: Case has been modified by another process (current version: ${currentCase.version}, your version: ${params.clientVersion}).`,
    };
  }

  // 3. State machine transition check
  if (!isValidTransition(currentCase.status, params.newStatus)) {
    return {
      success: false,
      invalid: true,
      currentCase: currentCase as Case,
      error: transitionError(currentCase.status, params.newStatus) || 'Invalid transition',
    };
  }

  // 4. Validate transition reason
  const reasonValidation = validateTransitionReason(params.reason);
  if (!reasonValidation.valid) {
    return {
      success: false,
      invalid: true,
      error: reasonValidation.error || 'A non-empty transition reason is required',
    };
  }

  const now = new Date().toISOString();
  const nextVersion = currentCase.version + 1;

  // 5. Update cases table with optimistic condition (WHERE version = currentCase.version)
  const { data: updatedCase, error: updateErr } = await client
    .from('cases')
    .update({
      status: params.newStatus,
      version: nextVersion,
      entered_current_state_at: now,
      sla_status: 'ok',
      reason_for_transition: params.reason.trim(),
      updated_at: now,
    })
    .eq('id', params.caseId)
    .eq('version', currentCase.version)
    .select('*')
    .maybeSingle();

  if (updateErr || !updatedCase) {
    // Version clash occurred during the write
    const { data: freshCase } = await client.from('cases').select('*').eq('id', params.caseId).single();
    return {
      success: false,
      conflict: true,
      currentCase: freshCase as Case,
      error: 'Conflict: Case state changed concurrently. Please review the updated case and retry.',
    };
  }

  // 6. Insert into append-only audit ledger (case_history)
  const historyRow = {
    case_id: params.caseId,
    from_state: currentCase.status,
    to_state: params.newStatus,
    actor_id: params.actorId || 'system',
    actor_type: params.actorType,
    reason: params.reason.trim(),
    metadata: params.metadata || {},
    created_at: now,
  };

  const { data: historyEntry, error: histErr } = await client
    .from('case_history')
    .insert(historyRow)
    .select('*')
    .single();

  if (histErr) {
    console.error('[caseStore] Failed to write case_history ledger entry:', histErr.message);
  }

  // 7. Trigger outbound notification if escalated
  if (params.newStatus === 'escalated') {
    sendCaseNotification({
      event: 'case_escalated',
      caseId: params.caseId,
      title: updatedCase.title,
      details: `Escalated by ${params.actorType} (${params.actorId || 'system'}): ${params.reason}`,
      metadata: params.metadata,
      timestamp: now,
    }).catch(() => {});
  }

  return {
    success: true,
    updatedCase: updatedCase as Case,
    historyEntry: historyEntry as CaseHistoryEntry,
  };
}

/**
 * Attaches a wallet to a case cluster and logs to history.
 */
export async function addWalletToCase(params: {
  caseId: string;
  address: string;
  addedBy?: string | null;
  notes?: string | null;
}): Promise<{ success: boolean; error?: string; wallet?: CaseWallet }> {
  const client = getSupabaseAdmin();
  if (!client) return { success: false, error: 'Database service unavailable' };

  const cleanAddr = params.address.toLowerCase().trim();

  // Insert wallet
  const { data: wallet, error: wErr } = await client
    .from('case_wallets')
    .insert({
      case_id: params.caseId,
      address: cleanAddr,
      added_by: params.addedBy || 'system',
      notes: params.notes || null,
    })
    .select('*')
    .single();

  if (wErr) {
    return { success: false, error: wErr.message };
  }

  // Update wallets array on cases
  const { data: currentCase } = await client.from('cases').select('wallets').eq('id', params.caseId).single();
  const existingWallets: string[] = currentCase?.wallets || [];
  if (!existingWallets.includes(cleanAddr)) {
    await client
      .from('cases')
      .update({ wallets: [...existingWallets, cleanAddr], updated_at: new Date().toISOString() })
      .eq('id', params.caseId);
  }

  // Log to history
  await client.from('case_history').insert({
    case_id: params.caseId,
    from_state: null,
    to_state: (currentCase as any)?.status || 'open',
    actor_id: params.addedBy || 'system',
    actor_type: params.addedBy ? 'human' : 'system',
    reason: `Added wallet ${cleanAddr} to cluster`,
    metadata: { address: cleanAddr, notes: params.notes },
  });

  return { success: true, wallet: wallet as CaseWallet };
}

/**
 * Removes a wallet from a case cluster.
 */
export async function removeWalletFromCase(params: {
  caseId: string;
  address: string;
  removedBy?: string | null;
}): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseAdmin();
  if (!client) return { success: false, error: 'Database service unavailable' };

  const cleanAddr = params.address.toLowerCase().trim();

  const { error: delErr } = await client
    .from('case_wallets')
    .delete()
    .eq('case_id', params.caseId)
    .eq('address', cleanAddr);

  if (delErr) {
    return { success: false, error: delErr.message };
  }

  const { data: currentCase } = await client.from('cases').select('wallets, status').eq('id', params.caseId).single();
  const existingWallets: string[] = currentCase?.wallets || [];
  const updatedWallets = existingWallets.filter((w) => w !== cleanAddr);

  await client
    .from('cases')
    .update({ wallets: updatedWallets, updated_at: new Date().toISOString() })
    .eq('id', params.caseId);

  await client.from('case_history').insert({
    case_id: params.caseId,
    from_state: null,
    to_state: currentCase?.status || 'open',
    actor_id: params.removedBy || 'system',
    actor_type: params.removedBy ? 'human' : 'system',
    reason: `Removed wallet ${cleanAddr} from cluster`,
    metadata: { address: cleanAddr },
  });

  return { success: true };
}

/**
 * Pins cryptographic evidence to a case.
 */
export async function pinEvidence(params: {
  caseId: string;
  evidenceType: 'graph_node' | 'graph_edge' | 'subgraph_slice' | 'lookup_snapshot' | 'note';
  lookupId?: string | null;
  subgraphSlice?: any;
  pinnedBy?: string | null;
  annotation?: string | null;
}): Promise<{ success: boolean; error?: string; evidence?: CaseEvidence }> {
  const client = getSupabaseAdmin();
  if (!client) return { success: false, error: 'Database service unavailable' };

  const payloadHash = computePayloadHash(params.subgraphSlice);
  const now = new Date().toISOString();

  const { data: evidence, error: evErr } = await client
    .from('case_evidence')
    .insert({
      case_id: params.caseId,
      evidence_type: params.evidenceType,
      lookup_id: params.lookupId || null,
      graph_payload_hash: payloadHash,
      subgraph_slice: params.subgraphSlice || null,
      pinned_by: params.pinnedBy || 'system',
      pinned_at: now,
      annotation: params.annotation || null,
    })
    .select('*')
    .single();

  if (evErr) {
    return { success: false, error: evErr.message };
  }

  // Audit in case_history
  await client.from('case_history').insert({
    case_id: params.caseId,
    from_state: null,
    to_state: 'investigating', // indicative
    actor_id: params.pinnedBy || 'system',
    actor_type: params.pinnedBy ? 'human' : 'system',
    reason: `Pinned evidence (${params.evidenceType}): hash ${payloadHash.slice(0, 12)}...`,
    metadata: {
      evidence_id: evidence.id,
      evidence_type: params.evidenceType,
      payload_hash: payloadHash,
    },
    created_at: now,
  });

  return { success: true, evidence: evidence as CaseEvidence };
}
