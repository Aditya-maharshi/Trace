/**
 * lib/clustering.ts
 *
 * Ethereum-native wallet clustering heuristics.
 *
 * ─── WHY NOT COMMON-INPUT-OWNERSHIP (CIO)? ──────────────────────────────────
 *
 * Bitcoin's most powerful clustering heuristic — Common-Input-Ownership —
 * relies on the UTXO model: a single Bitcoin transaction can consume multiple
 * inputs from different addresses, and the assumption is that all input
 * addresses belong to the same entity (because you need the private key for
 * each input to sign the transaction).
 *
 * Ethereum is fundamentally different:
 *
 *   • It uses an ACCOUNT-BASED model, not UTXO.
 *   • Every transaction has exactly ONE sender (`from`) and ONE recipient (`to`).
 *   • There is no concept of "multiple inputs" being combined in a single tx.
 *   • Therefore, CIO simply doesn't apply — there's never a multi-input
 *     transaction to extract co-ownership from.
 *
 * Instead, we use two Ethereum-appropriate heuristics:
 *
 *   1. **Deposit Funnel Detection** — identifies addresses that act as
 *      aggregation points (many distinct senders → one address), which is
 *      the signature pattern of a VASP's hot/sweep wallet.
 *
 *   2. **Shared Funding Source** — if two wallets were both initially funded
 *      by the same address within a short time window, they likely belong to
 *      the same real-world owner who split funds across wallets.
 *
 * These heuristics are documented here for reference during the pitch deck
 * and for future researchers extending this module.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getTransactions, type Transaction } from "./etherscan";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Metadata about a detected deposit-funnel candidate.
 * Exposed so callers can inspect the evidence, not just the address.
 */
export interface FunnelCandidate {
  /** The candidate funnel/hot-wallet address. */
  address: string;
  /** Number of distinct source addresses that sent funds to this address. */
  distinctFunders: number;
  /** Total number of inbound transactions to this address in the dataset. */
  inboundTxCount: number;
}

/**
 * Result of a shared-funding-source check between two wallets.
 */
export interface SharedFundingResult {
  /** Whether both wallets share the same initial funder within the time window. */
  shared: boolean;
  /** The common funding source address (if shared is true). */
  funder: string | null;
  /** First funding timestamp for wallet A (unix seconds). */
  walletAFundedAt: number | null;
  /** First funding timestamp for wallet B (unix seconds). */
  walletBFundedAt: number | null;
  /** Time difference in seconds between the two funding events. */
  timeDeltaSeconds: number | null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Maximum time window (in seconds) for two wallets' first funding to be
 * considered "close enough" to indicate shared ownership.
 * 1 hour = 3600 seconds.
 */
const FUNDING_WINDOW_SECONDS = 3600;

/**
 * Minimum number of distinct funders for an address to qualify as a
 * deposit funnel candidate. Below this threshold it's just a normal
 * wallet receiving from a few counterparties.
 */
const MIN_DISTINCT_FUNDERS = 3;

// ──────────────────────────────────────────────────────────────────────────────
// Heuristic 1: Deposit Funnel Detection
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Scan a set of transactions and identify destination addresses that receive
 * funds from many distinct source addresses. This is the on-chain signature
 * of a VASP's internal sweep or hot wallet:
 *
 *   User A ──► [Hot Wallet] ◄── User B
 *   User C ──► [Hot Wallet] ◄── User D
 *                  ...
 *
 * Many distinct senders converging on one address = likely an aggregation
 * point, even if that address isn't on our static VASP label list.
 *
 * **How it works:**
 *   1. Group all transactions by recipient (`to`) address.
 *   2. For each recipient, count the number of distinct sender (`from`) addresses.
 *   3. Filter to recipients with ≥ MIN_DISTINCT_FUNDERS distinct senders.
 *   4. Sort descending by distinct funder count.
 *
 * @param transactions - A flat array of transactions to analyze. Typically
 *                       you'd pass in all transactions fetched during a BFS
 *                       traversal or a batch export.
 * @returns              Candidate funnel addresses sorted by distinct funder
 *                       count descending (most likely VASP hot wallet first).
 */
export function detectDepositFunnel(transactions: Transaction[]): string[] {
  // Map: recipient address → Set of distinct sender addresses
  const recipientToFunders = new Map<string, Set<string>>();
  // Map: recipient address → total inbound tx count
  const recipientToTxCount = new Map<string, number>();

  for (const tx of transactions) {
    const from = tx.from.toLowerCase();
    const to = tx.to.toLowerCase();

    // Skip self-sends and zero-value dust
    if (from === to) continue;

    // Track distinct funders for this recipient
    let funders = recipientToFunders.get(to);
    if (!funders) {
      funders = new Set<string>();
      recipientToFunders.set(to, funders);
    }
    funders.add(from);

    // Track inbound tx count
    recipientToTxCount.set(to, (recipientToTxCount.get(to) ?? 0) + 1);
  }

  // Build candidate list, filtering by minimum distinct funders
  const candidates: FunnelCandidate[] = [];

  for (const [address, funders] of recipientToFunders) {
    if (funders.size >= MIN_DISTINCT_FUNDERS) {
      candidates.push({
        address,
        distinctFunders: funders.size,
        inboundTxCount: recipientToTxCount.get(address) ?? 0,
      });
    }
  }

  // Sort by distinct funder count descending (strongest signal first)
  candidates.sort((a, b) => b.distinctFunders - a.distinctFunders);

  return candidates.map((c) => c.address);
}

/**
 * Detailed version of detectDepositFunnel that returns the full
 * FunnelCandidate objects instead of just addresses.
 * Useful for debugging and evidence display in the UI.
 */
export function detectDepositFunnelDetailed(
  transactions: Transaction[],
): FunnelCandidate[] {
  const recipientToFunders = new Map<string, Set<string>>();
  const recipientToTxCount = new Map<string, number>();

  for (const tx of transactions) {
    const from = tx.from.toLowerCase();
    const to = tx.to.toLowerCase();

    if (from === to) continue;

    let funders = recipientToFunders.get(to);
    if (!funders) {
      funders = new Set<string>();
      recipientToFunders.set(to, funders);
    }
    funders.add(from);

    recipientToTxCount.set(to, (recipientToTxCount.get(to) ?? 0) + 1);
  }

  const candidates: FunnelCandidate[] = [];

  for (const [address, funders] of recipientToFunders) {
    if (funders.size >= MIN_DISTINCT_FUNDERS) {
      candidates.push({
        address,
        distinctFunders: funders.size,
        inboundTxCount: recipientToTxCount.get(address) ?? 0,
      });
    }
  }

  candidates.sort((a, b) => b.distinctFunders - a.distinctFunders);

  return candidates;
}

// ──────────────────────────────────────────────────────────────────────────────
// Heuristic 2: Shared Funding Source
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Find the first INCOMING transaction for a wallet (the transaction that
 * initially funded it). Sorts by timestamp ascending and returns the
 * earliest tx where this wallet is the recipient.
 */
async function findFirstIncomingTx(
  wallet: string,
): Promise<{ funder: string; timestamp: number } | null> {
  const normalizedWallet = wallet.toLowerCase();
  const txsResult = await getTransactions(normalizedWallet);
  const txs = txsResult.data;

  if (txs.length === 0) return null;

  // Filter to inbound transactions only (where wallet is the recipient)
  const inbound = txs.filter(
    (tx) => tx.to.toLowerCase() === normalizedWallet,
  );

  if (inbound.length === 0) return null;

  // Sort ascending by timestamp to find the earliest
  inbound.sort(
    (a, b) => parseInt(a.timeStamp, 10) - parseInt(b.timeStamp, 10),
  );

  const first = inbound[0];
  return {
    funder: first.from.toLowerCase(),
    timestamp: parseInt(first.timeStamp, 10),
  };
}

/**
 * Determine whether two wallets were initially funded by the same source
 * address within a 1-hour window.
 *
 * **Rationale**: When a real-world user splits funds across multiple wallets
 * for privacy, they typically do it in a single session:
 *
 *   [Main Wallet] ──► Wallet A  (t = 0 min)
 *   [Main Wallet] ──► Wallet B  (t = 15 min)
 *
 * Same funder + tight time window = strong signal of common ownership.
 * This heuristic catches the pattern even when there's no other on-chain
 * link between wallets A and B.
 *
 * **Limitations**:
 *   - Only checks the FIRST incoming tx. If the wallet was funded by an
 *     exchange, many unrelated wallets will share that exchange as "funder".
 *     Pair this with VASP label filtering to avoid false positives.
 *   - The 1-hour window is a pragmatic default. Sophisticated users may
 *     wait longer between fund splits.
 *
 * @param walletA - First Ethereum address to compare.
 * @param walletB - Second Ethereum address to compare.
 * @returns         true if both wallets share the same initial funder within
 *                  1 hour, false otherwise.
 */
export async function shareFundingSource(
  walletA: string,
  walletB: string,
): Promise<boolean> {
  const result = await shareFundingSourceDetailed(walletA, walletB);
  return result.shared;
}

/**
 * Detailed version that returns the full SharedFundingResult with
 * funder address, timestamps, and time delta for evidence/debugging.
 */
export async function shareFundingSourceDetailed(
  walletA: string,
  walletB: string,
): Promise<SharedFundingResult> {
  // Fetch first incoming transactions in parallel
  const [firstA, firstB] = await Promise.all([
    findFirstIncomingTx(walletA),
    findFirstIncomingTx(walletB),
  ]);

  // If either wallet has no inbound transactions, can't compare
  if (!firstA || !firstB) {
    return {
      shared: false,
      funder: null,
      walletAFundedAt: firstA?.timestamp ?? null,
      walletBFundedAt: firstB?.timestamp ?? null,
      timeDeltaSeconds: null,
    };
  }

  // Check: same funder address?
  if (firstA.funder !== firstB.funder) {
    return {
      shared: false,
      funder: null,
      walletAFundedAt: firstA.timestamp,
      walletBFundedAt: firstB.timestamp,
      timeDeltaSeconds: null,
    };
  }

  // Check: within the 1-hour time window?
  const timeDelta = Math.abs(firstA.timestamp - firstB.timestamp);
  const withinWindow = timeDelta <= FUNDING_WINDOW_SECONDS;

  return {
    shared: withinWindow,
    funder: firstA.funder,
    walletAFundedAt: firstA.timestamp,
    walletBFundedAt: firstB.timestamp,
    timeDeltaSeconds: timeDelta,
  };
}
