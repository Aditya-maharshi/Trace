/**
 * __tests__/lib/dataProvider.test.ts
 *
 * Unit tests for multi-tier caching and fallback data provider in lib/etherscan.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getTransactions,
  getTokenTransactions,
  clearTransactionCache,
  setProviders,
  resetProviders,
  type BlockchainDataProvider,
  type Transaction,
  type TokenTransaction,
} from "../../lib/etherscan";

describe("BlockchainDataProvider Caching & Fallback", () => {
  let mockPrimary: BlockchainDataProvider;
  let mockFallback: BlockchainDataProvider;

  const sampleTx: Transaction = {
    hash: "0xabc",
    from: "0x1111111111111111111111111111111111111111",
    to: "0x2222222222222222222222222222222222222222",
    value: "1000000000000000000",
    blockNumber: "100",
    timeStamp: "1700000000",
  };

  const sampleTokenTx: TokenTransaction = {
    hash: "0xdef",
    from: "0x1111111111111111111111111111111111111111",
    to: "0x3333333333333333333333333333333333333333",
    value: "50000000",
    tokenSymbol: "USDT",
    tokenDecimal: "6",
    contractAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7",
    timeStamp: "1700000000",
    blockNumber: "101",
  };

  beforeEach(async () => {
    await clearTransactionCache();

    mockPrimary = {
      name: "MockEtherscan",
      getTransactions: vi.fn().mockResolvedValue([sampleTx]),
      getTokenTransactions: vi.fn().mockResolvedValue([sampleTokenTx]),
    };

    mockFallback = {
      name: "MockBlockscout",
      getTransactions: vi.fn().mockResolvedValue([]),
      getTokenTransactions: vi.fn().mockResolvedValue([]),
    };

    setProviders(mockPrimary, mockFallback);
  });

  afterEach(() => {
    resetProviders();
  });

  it("serves repeated requests from cache without re-querying primary provider", async () => {
    const address = "0x1111111111111111111111111111111111111111";

    // 1st call: queries primary
    const res1 = await getTransactions(address, 100);
    expect(res1).toEqual([sampleTx]);
    expect(mockPrimary.getTransactions).toHaveBeenCalledTimes(1);
    expect(mockFallback.getTransactions).not.toHaveBeenCalled();

    // 2nd call: served from in-memory cache
    const res2 = await getTransactions(address, 100);
    expect(res2).toEqual([sampleTx]);
    expect(mockPrimary.getTransactions).toHaveBeenCalledTimes(1); // not called again!
  });

  it("serves token transactions from cache on second call", async () => {
    const address = "0x1111111111111111111111111111111111111111";

    const res1 = await getTokenTransactions(address, 50);
    expect(res1).toEqual([sampleTokenTx]);
    expect(mockPrimary.getTokenTransactions).toHaveBeenCalledTimes(1);

    const res2 = await getTokenTransactions(address, 50);
    expect(res2).toEqual([sampleTokenTx]);
    expect(mockPrimary.getTokenTransactions).toHaveBeenCalledTimes(1);
  });

  it("re-queries provider after cache is cleared", async () => {
    const address = "0x1111111111111111111111111111111111111111";

    await getTransactions(address, 100);
    expect(mockPrimary.getTransactions).toHaveBeenCalledTimes(1);

    await clearTransactionCache();

    await getTransactions(address, 100);
    expect(mockPrimary.getTransactions).toHaveBeenCalledTimes(2);
  });

  it("falls back to secondary provider when primary provider throws rate limit error", async () => {
    const address = "0x2222222222222222222222222222222222222222";
    const fallbackTx: Transaction = {
      ...sampleTx,
      hash: "0xfrom_fallback",
    };

    mockPrimary.getTransactions = vi.fn().mockRejectedValue(new Error("Etherscan rate limit: Max rate limit reached"));
    mockFallback.getTransactions = vi.fn().mockResolvedValue([fallbackTx]);

    const res = await getTransactions(address, 100);

    expect(mockPrimary.getTransactions).toHaveBeenCalledTimes(1);
    expect(mockFallback.getTransactions).toHaveBeenCalledTimes(1);
    expect(res).toEqual([fallbackTx]);

    // Subsequent call should be served from cache
    const cached = await getTransactions(address, 100);
    expect(cached).toEqual([fallbackTx]);
    expect(mockFallback.getTransactions).toHaveBeenCalledTimes(1);
  });

  it("throws combined error when both primary and fallback providers fail", async () => {
    const address = "0x3333333333333333333333333333333333333333";

    mockPrimary.getTransactions = vi.fn().mockRejectedValue(new Error("Etherscan 429 Too Many Requests"));
    mockFallback.getTransactions = vi.fn().mockRejectedValue(new Error("Blockscout 502 Bad Gateway"));

    await expect(getTransactions(address, 100)).rejects.toThrow(
      /All blockchain data providers failed for 0x3333333333333333333333333333333333333333/,
    );

    expect(mockPrimary.getTransactions).toHaveBeenCalledTimes(1);
    expect(mockFallback.getTransactions).toHaveBeenCalledTimes(1);
  });
});
