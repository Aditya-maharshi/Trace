/**
 * lib/domains/tracing/adapters/ethereumAdapter.ts
 *
 * Ethereum ChainAdapter — wraps the existing EtherscanProvider +
 * BlockscoutProvider from etherscan.ts into the canonical ChainAdapter
 * interface. Zero logic duplication: all caching, retries, timeout, and
 * concurrency limiting remain in etherscan.ts.
 *
 * API keys used by underlying providers:
 *   ETHERSCAN_API_KEY  — required for mainnet; free tier if absent
 *   BLOCKSCOUT_API_KEY — optional fallback enhancement
 *
 * ### Entity lookup
 * Delegates to the shared entityStore (Supabase entity_labels + static registries).
 */

import type {
  ChainAdapter,
  NormalisedTransaction,
  KnownEntityResult,
  GetTransactionsOpts,
} from "../chainAdapter";
import { BlockchainFetchError } from "../chainAdapter";
import {
  getTransactions,
  getTokenTransactions,
  type Transaction,
  type TokenTransaction,
} from "../etherscan";
import { weiToUSD, tokenValueToUSD } from "../attribution";
import { lookupEntity } from "../entityStore";

// ─────────────────────────────────────────────────────────────────────────────
// Normalisation helpers
// ─────────────────────────────────────────────────────────────────────────────

function normaliseTx(
  tx: Transaction,
  queried: string,
): NormalisedTransaction {
  return {
    txHash: tx.hash,
    from: tx.from.toLowerCase(),
    to: tx.to.toLowerCase(),
    amountRaw: tx.value,
    amountUSD: weiToUSD(tx.value),
    timestamp: new Date(parseInt(tx.timeStamp, 10) * 1000).toISOString(),
    timestampSec: parseInt(tx.timeStamp, 10),
    chain: "ethereum",
    asset: "ETH",
    blockNumber: tx.blockNumber,
  };
}

function normaliseTokenTx(
  tx: TokenTransaction,
  queried: string,
): NormalisedTransaction {
  return {
    txHash: tx.hash,
    from: tx.from.toLowerCase(),
    to: tx.to.toLowerCase(),
    amountRaw: tx.value,
    amountUSD: tokenValueToUSD(tx.value, tx.tokenDecimal ?? 18, tx.tokenSymbol),
    timestamp: new Date(parseInt(tx.timeStamp, 10) * 1000).toISOString(),
    timestampSec: parseInt(tx.timeStamp, 10),
    chain: "ethereum",
    asset: tx.tokenSymbol || "ERC20",
    blockNumber: tx.blockNumber,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EthereumAdapter
// ─────────────────────────────────────────────────────────────────────────────

export class EthereumAdapter implements ChainAdapter {
  public readonly chain = "ethereum" as const;

  /**
   * Fetch transactions for an Ethereum address.
   *
   * Delegates to the existing `getTransactions` + `getTokenTransactions`
   * functions which handle caching, retries, Etherscan/Blockscout fallback,
   * and concurrency limiting.
   *
   * @throws {BlockchainFetchError} if both providers fail.
   */
  async getTransactionsForAddress(
    address: string,
    opts: GetTransactionsOpts = {},
  ): Promise<NormalisedTransaction[]> {
    const pageSize = opts.pageSize ?? 100;

    try {
      const [ethResult, tokenResult] = await Promise.all([
        getTransactions(address, pageSize),
        getTokenTransactions(address, pageSize),
      ]);

      const ethTxs = ethResult.data.map((tx) => normaliseTx(tx, address));
      const tokenTxs = tokenResult.data.map((tx) => normaliseTokenTx(tx, address));

      const combined = [...ethTxs, ...tokenTxs];

      if (opts.outgoingOnly) {
        const addrLower = address.toLowerCase();
        return combined.filter((tx) => tx.from === addrLower);
      }

      return combined;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new BlockchainFetchError("ethereum", address, msg);
    }
  }

  /**
   * Check if an Ethereum address is a known entity.
   * Delegates to the shared entityStore.
   */
  async isKnownEntity(address: string): Promise<KnownEntityResult | null> {
    return lookupEntity(address, "ethereum");
  }
}
