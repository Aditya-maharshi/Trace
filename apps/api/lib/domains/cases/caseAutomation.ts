/**
 * lib/caseAutomation.ts
 *
 * Automated BFS engine for continuous case monitoring.
 * Discovers newly formed transaction paths between known case wallets and
 * sanctioned entities. On discovery, safely transitions the case to 'escalated'
 * via the same atomic single-write path used by human analysts.
 */

import { getSupabaseAdmin } from './auditLog';
import { transitionCase } from './caseStore';
import { checkSanctionedDetailed, type SanctionsCheckResult } from './sanctions';
import { getTransactions, getTokenTransactions } from './etherscan';
import { extractNormalizedNeighbors, rankNeighborsByValue, rankNeighborsByStructuringSignal, ALLOWED_TOKEN_CONTRACTS } from './graphBuilder';

const MAX_DEPTH = 4;
const MAX_FANOUT = 15;
const MAX_BUDGET_MS = 20_000;

interface QueueItem {
  address: string;
  depth: number;
  path: string[];
}

/**
 * Runs an incremental BFS scan for all wallets attached to a case.
 * Escalate if any path <= MAX_DEPTH leads to a sanctioned entity.
 */
export async function runCaseAutomationScan(caseId: string): Promise<void> {
  const client = getSupabaseAdmin();
  if (!client) return;

  // 1. Fetch case and attached wallets
  const { data: currentCase } = await client
    .from('cases')
    .select('id, status, version')
    .eq('id', caseId)
    .single();

  if (!currentCase) return;

  // Terminal cases don't get auto-escalated
  if (currentCase.status === 'closed' || currentCase.status === 'escalated') {
    return;
  }

  const { data: wallets } = await client
    .from('case_wallets')
    .select('address')
    .eq('case_id', caseId);

  if (!wallets || wallets.length === 0) return;

  const startAddresses = wallets.map(w => w.address.toLowerCase());

  // 2. Perform BFS from all start addresses simultaneously
  const visited = new Set<string>();
  const queue: QueueItem[] = [];

  for (const addr of startAddresses) {
    visited.add(addr);
    queue.push({ address: addr, depth: 0, path: [addr] });
  }

  const searchStartTime = Date.now();
  let foundSanctionedPath: { path: string[]; sanctionsResult: SanctionsCheckResult } | null = null;

  while (queue.length > 0) {
    if (Date.now() - searchStartTime >= MAX_BUDGET_MS) {
      break;
    }

    const current = queue.shift()!;

    // Check if the current node is sanctioned
    const sanctionsResult = await checkSanctionedDetailed(current.address);
    if (sanctionsResult.sanctioned) {
      foundSanctionedPath = { path: current.path, sanctionsResult };
      break; // Stop on first hit
    }

    if (current.depth >= MAX_DEPTH) {
      continue;
    }

    try {
      const [ethRaw, tokenRaw] = await Promise.all([
        getTransactions(current.address),
        getTokenTransactions(current.address).catch(() => ({ data: [], truncated: false }))
      ]);

      const ethData = Array.isArray(ethRaw) ? ethRaw : (ethRaw?.data || []);
      const tokenData = Array.isArray(tokenRaw) ? tokenRaw : (tokenRaw?.data || []);
      
      const filteredTokens = tokenData.filter(t => 
        ALLOWED_TOKEN_CONTRACTS.has(t.contractAddress.toLowerCase())
      );

      const transactions = [...ethData, ...filteredTokens];

      const neighborMap = extractNormalizedNeighbors(transactions, current.address);
      
      const valueBudget = Math.max(1, Math.round(MAX_FANOUT * (2 / 3)));
      const structuringBudget = Math.max(1, MAX_FANOUT - valueBudget);

      const topValueNeighbors = rankNeighborsByValue(neighborMap, valueBudget);
      const topStructuringNeighbors = rankNeighborsByStructuringSignal(neighborMap, structuringBudget);

      const valueSet = new Set(topValueNeighbors);
      const structuringOnlySet = new Set(topStructuringNeighbors.filter(addr => !valueSet.has(addr)));

      const combinedNeighbors = [...topValueNeighbors, ...Array.from(structuringOnlySet)].slice(0, MAX_FANOUT);

      for (const neighbor of combinedNeighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push({
            address: neighbor,
            depth: current.depth + 1,
            path: [...current.path, neighbor]
          });
        }
      }
    } catch (err) {
      console.warn(`[caseAutomation] fetch failed for ${current.address}`, err);
    }
  }

  // 3. Auto-escalate if a sanction path was found
  if (foundSanctionedPath) {
    const { path, sanctionsResult } = foundSanctionedPath;
    
    // Idempotency check: has this case already been auto-escalated for this specific sanctions match?
    const dedupKey = `${sanctionsResult.address}_${sanctionsResult.checkedAt.split('T')[0]}`;
    
    const { data: existingHist } = await client
      .from('case_history')
      .select('id')
      .eq('case_id', caseId)
      .eq('actor_type', 'system')
      .eq('to_state', 'escalated')
      .contains('metadata', { dedup_key: dedupKey })
      .limit(1);

    if (existingHist && existingHist.length > 0) {
      return; // Already escalated for this specific hit today
    }

    const metadata = {
      path,
      sanctioned_address: sanctionsResult.address,
      match_count: sanctionsResult.matchCount,
      list_version_date: sanctionsResult.checkedAt,
      dedup_key: dedupKey
    };

    // Transition securely via single-write path
    await transitionCase({
      caseId,
      newStatus: 'escalated',
      reason: 'Automated: sanctioned path detected',
      actorId: null,
      actorType: 'system',
      metadata,
      clientVersion: currentCase.version
    });
  }
}
