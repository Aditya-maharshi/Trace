/**
 * __tests__/lib/graphBuilder.test.ts
 *
 * Unit tests for lib/graphBuilder.ts — neighbor extraction, ranking, and BFS.
 * The BFS tests mock getTransactions to avoid hitting real Etherscan.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Transaction, TokenTransaction } from "../../lib/etherscan";
import {
  extractNeighbors,
  extractNormalizedNeighbors,
  rankNeighborsByValue,
  rankNeighborsByStructuringSignal,
  computeStructuringScore,
  findNearestVASP,
  ALLOWED_TOKEN_CONTRACTS,
  type AggregatedNeighbor,
} from "../../lib/graphBuilder";

// ──────────────────────────────────────────────────────────────────────────────
// extractNeighbors
// ──────────────────────────────────────────────────────────────────────────────

describe("extractNeighbors", () => {
  const currentAddress = "0xAAAA";

  it("skips self-transactions (from === to)", () => {
    const txs: Transaction[] = [
      {
        hash: "0x1",
        from: "0xAAAA",
        to: "0xAAAA",
        value: "1000",
        blockNumber: "1",
        timeStamp: "1000000",
      },
    ];

    const neighbors = extractNeighbors(txs, currentAddress);
    expect(neighbors.size).toBe(0);
  });

  it("extracts neighbor when current is sender (to is neighbor)", () => {
    const txs: Transaction[] = [
      {
        hash: "0x1",
        from: "0xAAAA",
        to: "0xBBBB",
        value: "5000",
        blockNumber: "1",
        timeStamp: "1000000",
      },
    ];

    const neighbors = extractNeighbors(txs, currentAddress);
    expect(neighbors.size).toBe(1);
    expect(neighbors.get("0xbbbb")).toBe(5000n);
  });

  it("extracts neighbor when current is receiver (from is neighbor)", () => {
    const txs: Transaction[] = [
      {
        hash: "0x1",
        from: "0xCCCC",
        to: "0xAAAA",
        value: "7000",
        blockNumber: "1",
        timeStamp: "1000000",
      },
    ];

    const neighbors = extractNeighbors(txs, currentAddress);
    expect(neighbors.size).toBe(1);
    expect(neighbors.get("0xcccc")).toBe(7000n);
  });

  it("aggregates value across multiple transactions to the same neighbor", () => {
    const txs: Transaction[] = [
      {
        hash: "0x1",
        from: "0xAAAA",
        to: "0xBBBB",
        value: "3000",
        blockNumber: "1",
        timeStamp: "1000000",
      },
      {
        hash: "0x2",
        from: "0xBBBB",
        to: "0xAAAA",
        value: "2000",
        blockNumber: "2",
        timeStamp: "1000001",
      },
      {
        hash: "0x3",
        from: "0xAAAA",
        to: "0xBBBB",
        value: "1000",
        blockNumber: "3",
        timeStamp: "1000002",
      },
    ];

    const neighbors = extractNeighbors(txs, currentAddress);
    expect(neighbors.size).toBe(1);
    // 3000 + 2000 + 1000 = 6000
    expect(neighbors.get("0xbbbb")).toBe(6000n);
  });

  it("distinguishes multiple different neighbors", () => {
    const txs: Transaction[] = [
      {
        hash: "0x1",
        from: "0xAAAA",
        to: "0xBBBB",
        value: "1000",
        blockNumber: "1",
        timeStamp: "1000000",
      },
      {
        hash: "0x2",
        from: "0xCCCC",
        to: "0xAAAA",
        value: "2000",
        blockNumber: "2",
        timeStamp: "1000001",
      },
    ];

    const neighbors = extractNeighbors(txs, currentAddress);
    expect(neighbors.size).toBe(2);
    expect(neighbors.get("0xbbbb")).toBe(1000n);
    expect(neighbors.get("0xcccc")).toBe(2000n);
  });

  it("is case-insensitive for address matching", () => {
    const txs: Transaction[] = [
      {
        hash: "0x1",
        from: "0xaaaa", // lowercase version of currentAddress
        to: "0xDDDD",
        value: "500",
        blockNumber: "1",
        timeStamp: "1000000",
      },
    ];

    const neighbors = extractNeighbors(txs, "0xAAAA");
    expect(neighbors.size).toBe(1);
    expect(neighbors.get("0xdddd")).toBe(500n);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// rankNeighborsByValue
// ──────────────────────────────────────────────────────────────────────────────

describe("rankNeighborsByValue", () => {
  it("returns top-N neighbors in descending order", () => {
    const neighborMap = new Map<string, bigint>([
      ["0xa", 100n],
      ["0xb", 500n],
      ["0xc", 300n],
      ["0xd", 200n],
      ["0xe", 400n],
    ]);

    const result = rankNeighborsByValue(neighborMap, 3);
    expect(result).toEqual(["0xb", "0xe", "0xc"]);
  });

  it("returns all entries when maxFanout exceeds map size", () => {
    const neighborMap = new Map<string, bigint>([
      ["0xa", 100n],
      ["0xb", 200n],
    ]);

    const result = rankNeighborsByValue(neighborMap, 10);
    expect(result).toHaveLength(2);
    // Should still be sorted descending
    expect(result).toEqual(["0xb", "0xa"]);
  });

  it("handles tie-breaking: both tied entries are included", () => {
    const neighborMap = new Map<string, bigint>([
      ["0xa", 500n],
      ["0xb", 500n], // tie with 0xa
      ["0xc", 100n],
    ]);

    const result = rankNeighborsByValue(neighborMap, 3);
    expect(result).toHaveLength(3);
    // Both 500n entries should be in the top 2, order doesn't matter for ties
    expect(result.slice(0, 2).sort()).toEqual(["0xa", "0xb"]);
    expect(result[2]).toBe("0xc");
  });

  it("returns empty for empty map", () => {
    const neighborMap = new Map<string, bigint>();
    const result = rankNeighborsByValue(neighborMap, 5);
    expect(result).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// findNearestVASP — BFS with mocked getTransactions
// ──────────────────────────────────────────────────────────────────────────────

// Mock the etherscan module so BFS never hits real Etherscan
vi.mock("../../lib/etherscan", () => ({
  getTransactions: vi.fn(),
  getTokenTransactions: vi.fn().mockResolvedValue([]),
}));

// Import the mocks after vi.mock declaration
import { getTransactions, getTokenTransactions } from "../../lib/etherscan";
const mockGetTransactions = vi.mocked(getTransactions);
const mockGetTokenTransactions = vi.mocked(getTokenTransactions);

describe("findNearestVASP", () => {
  beforeEach(() => {
    mockGetTransactions.mockReset();
    mockGetTokenTransactions.mockReset().mockResolvedValue([]);
  });

  it("returns immediately when start wallet is itself a VASP (depth 0)", async () => {
    const vaspSet = new Set(["0xvasp1"]);
    const results = await findNearestVASP("0xVASP1", vaspSet, 3, 15);

    expect(results).toHaveLength(1);
    expect(results[0].depth).toBe(0);
    expect(results[0].nearestVASP).toBe("0xvasp1");
    expect(results[0].path).toEqual(["0xvasp1"]);
    // Should NOT have called getTransactions at all
    expect(mockGetTransactions).not.toHaveBeenCalled();
  });

  it("returns empty array when no VASP is reachable", async () => {
    // Graph: start → A → B (dead end, no VASPs)
    mockGetTransactions.mockImplementation(async (address: string) => {
      const addr = address.toLowerCase();
      if (addr === "0xstart") {
        return [
          {
            hash: "0x1",
            from: "0xstart",
            to: "0xaaa",
            value: "1000",
            blockNumber: "1",
            timeStamp: "1000000",
          },
        ];
      }
      if (addr === "0xaaa") {
        return [
          {
            hash: "0x2",
            from: "0xaaa",
            to: "0xbbb",
            value: "500",
            blockNumber: "2",
            timeStamp: "1000001",
          },
        ];
      }
      return [];
    });

    const vaspSet = new Set(["0xvasp_not_reachable"]);
    const results = await findNearestVASP("0xstart", vaspSet, 2, 15);

    expect(results).toHaveLength(0);
  });

  it("finds VASP at depth 1", async () => {
    // Graph: start → vasp1
    mockGetTransactions.mockImplementation(async (address: string) => {
      const addr = address.toLowerCase();
      if (addr === "0xstart") {
        return [
          {
            hash: "0x1",
            from: "0xstart",
            to: "0xvasp1",
            value: "1000000000000000000",
            blockNumber: "100",
            timeStamp: "1700000000",
          },
        ];
      }
      return [];
    });

    const vaspSet = new Set(["0xvasp1"]);
    const results = await findNearestVASP("0xstart", vaspSet, 3, 15);

    expect(results).toHaveLength(1);
    expect(results[0].depth).toBe(1);
    expect(results[0].nearestVASP).toBe("0xvasp1");
    expect(results[0].path).toEqual(["0xstart", "0xvasp1"]);
  });

  it("returns SHORTEST path when VASP is reachable at multiple depths", async () => {
    // Graph:
    //   start → mid1 → vasp1    (depth 2)
    //   start → vasp1            (depth 1) ← BFS should find this first
    //
    // BFS guarantee: the depth-1 path is found first because BFS explores
    // all depth-1 neighbors before any depth-2 neighbors.

    mockGetTransactions.mockImplementation(async (address: string) => {
      const addr = address.toLowerCase();
      if (addr === "0xstart") {
        return [
          {
            hash: "0x1",
            from: "0xstart",
            to: "0xmid1",
            value: "500",
            blockNumber: "1",
            timeStamp: "1000000",
          },
          {
            hash: "0x2",
            from: "0xstart",
            to: "0xvasp1",
            value: "1000",
            blockNumber: "2",
            timeStamp: "1000001",
          },
        ];
      }
      if (addr === "0xmid1") {
        return [
          {
            hash: "0x3",
            from: "0xmid1",
            to: "0xvasp1",
            value: "300",
            blockNumber: "3",
            timeStamp: "1000002",
          },
        ];
      }
      return [];
    });

    const vaspSet = new Set(["0xvasp1"]);
    const results = await findNearestVASP("0xstart", vaspSet, 3, 15);

    // BFS should find vasp1 at depth 1 first.
    // Since vasp1 is already visited after the depth-1 discovery, the depth-2
    // path through mid1 won't re-discover it.
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].depth).toBe(1);
    expect(results[0].nearestVASP).toBe("0xvasp1");
    expect(results[0].path).toEqual(["0xstart", "0xvasp1"]);
  });

  it("finds multiple different VASPs at different depths", async () => {
    // Graph:
    //   start → vasp1          (depth 1)
    //   start → mid → vasp2    (depth 2)

    mockGetTransactions.mockImplementation(async (address: string) => {
      const addr = address.toLowerCase();
      if (addr === "0xstart") {
        return [
          {
            hash: "0x1",
            from: "0xstart",
            to: "0xvasp1",
            value: "1000",
            blockNumber: "1",
            timeStamp: "1000000",
          },
          {
            hash: "0x2",
            from: "0xstart",
            to: "0xmid",
            value: "500",
            blockNumber: "2",
            timeStamp: "1000001",
          },
        ];
      }
      if (addr === "0xmid") {
        return [
          {
            hash: "0x3",
            from: "0xmid",
            to: "0xvasp2",
            value: "300",
            blockNumber: "3",
            timeStamp: "1000002",
          },
        ];
      }
      return [];
    });

    const vaspSet = new Set(["0xvasp1", "0xvasp2"]);
    const results = await findNearestVASP("0xstart", vaspSet, 3, 15);

    expect(results).toHaveLength(2);
    // First result should be depth 1 (vasp1)
    expect(results[0].depth).toBe(1);
    expect(results[0].nearestVASP).toBe("0xvasp1");
    // Second result should be depth 2 (vasp2)
    expect(results[1].depth).toBe(2);
    expect(results[1].nearestVASP).toBe("0xvasp2");
  });

  it("does not expand past maxDepth", async () => {
    // Graph: start → A → B → vasp1 (depth 3)
    // With maxDepth=2, vasp1 should NOT be found.

    mockGetTransactions.mockImplementation(async (address: string) => {
      const addr = address.toLowerCase();
      if (addr === "0xstart") {
        return [
          { hash: "0x1", from: "0xstart", to: "0xa", value: "1000", blockNumber: "1", timeStamp: "1000000" },
        ];
      }
      if (addr === "0xa") {
        return [
          { hash: "0x2", from: "0xa", to: "0xb", value: "500", blockNumber: "2", timeStamp: "1000001" },
        ];
      }
      if (addr === "0xb") {
        return [
          { hash: "0x3", from: "0xb", to: "0xvasp1", value: "300", blockNumber: "3", timeStamp: "1000002" },
        ];
      }
      return [];
    });

    const vaspSet = new Set(["0xvasp1"]);
    const results = await findNearestVASP("0xstart", vaspSet, 2, 15);

    // maxDepth=2 means we check nodes at depth 0, 1, 2 for VASP status
    // but don't expand depth-2 nodes' children.
    // vasp1 would be at depth 3, so it shouldn't be found.
    expect(results).toHaveLength(0);
  });

  it("handles getTransactions failure gracefully (continues BFS)", async () => {
    // Graph: start → A (fails) and start → vasp1
    mockGetTransactions.mockImplementation(async (address: string) => {
      const addr = address.toLowerCase();
      if (addr === "0xstart") {
        return [
          { hash: "0x1", from: "0xstart", to: "0xa", value: "1000", blockNumber: "1", timeStamp: "1000000" },
          { hash: "0x2", from: "0xstart", to: "0xvasp1", value: "500", blockNumber: "2", timeStamp: "1000001" },
        ];
      }
      if (addr === "0xa") {
        throw new Error("Etherscan rate limit");
      }
      return [];
    });

    const vaspSet = new Set(["0xvasp1"]);
    const results = await findNearestVASP("0xstart", vaspSet, 3, 15);

    // Should still find vasp1 despite 0xa failing
    expect(results).toHaveLength(1);
    expect(results[0].nearestVASP).toBe("0xvasp1");
    expect(results.incompleteTraversal.skippedNodes).toBe(1);
    expect(results.incompleteTraversal.skippedAddresses).toContain("0xa");
  });

  it("finds VASP at depth 1 when wallet only moves USDT (no ETH transfers)", async () => {
    mockGetTransactions.mockResolvedValue([]);
    mockGetTokenTransactions.mockImplementation(async (address: string) => {
      const addr = address.toLowerCase();
      if (addr === "0xstart") {
        return [
          {
            hash: "0xtx1",
            from: "0xstart",
            to: "0xbinance_usdt",
            value: "50000000000", // 50,000 USDT (6 decimals)
            tokenSymbol: "USDT",
            tokenDecimal: "6",
            contractAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7", // canonical USDT
            blockNumber: "12345",
            timeStamp: "1700000000",
          },
        ];
      }
      return [];
    });

    const vaspSet = new Set(["0xbinance_usdt"]);
    const results = await findNearestVASP("0xstart", vaspSet, 2, 15);

    expect(results).toHaveLength(1);
    expect(results[0].nearestVASP).toBe("0xbinance_usdt");
    expect(results[0].depth).toBe(1);
    expect(results[0].path).toEqual(["0xstart", "0xbinance_usdt"]);
  });

  it("filters out scam or unapproved token contracts", async () => {
    mockGetTransactions.mockResolvedValue([]);
    mockGetTokenTransactions.mockImplementation(async (address: string) => {
      const addr = address.toLowerCase();
      if (addr === "0xstart") {
        return [
          {
            hash: "0xtx_scam",
            from: "0xscam_airdrop",
            to: "0xstart",
            value: "999999999999999999999999",
            tokenSymbol: "CLAIM-AIRDROP-ETH",
            tokenDecimal: "18",
            contractAddress: "0x000000000000000000000000000000000000dead", // fake contract
            blockNumber: "12346",
            timeStamp: "1700000000",
          },
        ];
      }
      return [];
    });

    const vaspSet = new Set(["0xscam_airdrop"]);
    const results = await findNearestVASP("0xstart", vaspSet, 2, 15);

    // The scam token transfer should be filtered out, so 0xscam_airdrop is never visited
    expect(results).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// extractNormalizedNeighbors
// ──────────────────────────────────────────────────────────────────────────────

describe("extractNormalizedNeighbors", () => {
  const currentAddress = "0xstart";

  it("normalizes ETH and tokens so $50k USDT outranks $5 ETH dust", () => {
    const txs: (Transaction | TokenTransaction)[] = [
      // $5 worth of ETH: 0.002 ETH = 2 * 10^15 wei (at $2500/ETH = $5.00)
      {
        hash: "0xeth",
        from: "0xstart",
        to: "0xdust_eth_receiver",
        value: "2000000000000000",
        blockNumber: "1",
        timeStamp: "1000",
      },
      // $50k USDT: 50,000 * 10^6 = 5 * 10^10 raw units (at $1.00 = $50,000.00)
      {
        hash: "0xusdt",
        from: "0xstart",
        to: "0xbig_usdt_receiver",
        value: "50000000000",
        tokenSymbol: "USDT",
        tokenDecimal: "6",
        contractAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7",
        blockNumber: "2",
        timeStamp: "1001",
      },
    ];

    const neighborMap = extractNormalizedNeighbors(txs, currentAddress);

    expect(neighborMap.get("0xdust_eth_receiver")?.totalValueUSD).toBeCloseTo(5.0, 1);
    expect(neighborMap.get("0xbig_usdt_receiver")?.totalValueUSD).toBeCloseTo(50000.0, 1);

    // Ranking by normalized value must place the $50k USDT recipient FIRST
    const ranked = rankNeighborsByValue(neighborMap, 2);
    expect(ranked[0]).toBe("0xbig_usdt_receiver");
    expect(ranked[1]).toBe("0xdust_eth_receiver");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// computeStructuringScore & rankNeighborsByStructuringSignal
// ──────────────────────────────────────────────────────────────────────────────

describe("computeStructuringScore", () => {
  it("returns 0 for single transaction (no structuring possible)", () => {
    const neighbor: AggregatedNeighbor = {
      address: "0xa",
      totalValue: 1000n,
      totalValueUSD: 1000,
      txCount: 1,
      amountsUSD: [1000],
      timestampsSec: [1700000000],
    };
    expect(computeStructuringScore(neighbor)).toBe(0);
  });

  it("yields high score for repeated identical amounts within a short time window", () => {
    // 5 transfers of $9,000 within 2 hours
    const neighbor: AggregatedNeighbor = {
      address: "0xsmurf",
      totalValue: 45000n,
      totalValueUSD: 45000,
      txCount: 5,
      amountsUSD: [9000, 9000, 9000, 9000, 9000],
      timestampsSec: [1700000000, 1700001000, 1700002000, 1700003000, 1700007200], // 2 hours
    };

    const score = computeStructuringScore(neighbor);
    // stdDev = 0 -> CV = 0 -> amountSimilarity = 1.0
    // spanDays = 7200 / 86400 = 0.0833 -> timeClustering = 1 / 1.0833 = 0.923
    // score = 5 * 1.0 * 0.923 = 4.615
    expect(score).toBeGreaterThan(4.5);
  });

  it("yields low score for wildly varying amounts spread across months", () => {
    // 2 transfers: $10 and $10,000, 60 days apart
    const neighbor: AggregatedNeighbor = {
      address: "0xerratic",
      totalValue: 10010n,
      totalValueUSD: 10010,
      txCount: 2,
      amountsUSD: [10, 10000],
      timestampsSec: [1700000000, 1700000000 + 60 * 86400],
    };

    const score = computeStructuringScore(neighbor);
    // High CV and 60 days span makes score very small
    expect(score).toBeLessThan(0.1);
  });
});

describe("rankNeighborsByStructuringSignal", () => {
  it("ranks high-structuring neighbor above high-value but erratic neighbor", () => {
    const map = new Map<string, AggregatedNeighbor>();

    // Structured neighbor: 10 transfers of $100 in 1 hour (total $1,000)
    map.set("0xstructured", {
      address: "0xstructured",
      totalValue: 1000n,
      totalValueUSD: 1000,
      txCount: 10,
      amountsUSD: Array(10).fill(100),
      timestampsSec: Array.from({ length: 10 }, (_, i) => 1700000000 + i * 300),
    });

    // Erratic single transfer: $50,000
    map.set("0xwhalesingle", {
      address: "0xwhalesingle",
      totalValue: 50000n,
      totalValueUSD: 50000,
      txCount: 1,
      amountsUSD: [50000],
      timestampsSec: [1700000000],
    });

    const ranked = rankNeighborsByStructuringSignal(map, 5);
    expect(ranked).toEqual(["0xstructured"]);
  });
});

describe("findNearestVASP structuring union & hop flagging", () => {
  it("finds VASP via structuring neighbor that would have been pruned by raw value ranking", async () => {
    // Setup:
    // start wallet has 12 neighbors with single big transfers ($10,000 each)
    // and 1 neighbor (0xstruct_hop) with 10 transfers of $100 ($1,000 total)
    // Under valueBudget = 10 (with maxFanout = 15), 0xstruct_hop would be pruned!
    // Under structuringBudget = 5, 0xstruct_hop is selected into the union!
    // 0xstruct_hop connects to 0xvasp_target.
    const bigNeighbors = Array.from({ length: 12 }, (_, i) => ({
      hash: `0xbig_${i}`,
      from: "0xstart",
      to: `0xrandom_whale_${i}`,
      value: "10000000000", // $10,000 USDT
      tokenSymbol: "USDT",
      tokenDecimal: "6",
      contractAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7",
      blockNumber: "1",
      timeStamp: "1700000000",
    } as TokenTransaction));

    const smurfTransfers = Array.from({ length: 10 }, (_, i) => ({
      hash: `0xsmurf_${i}`,
      from: "0xstart",
      to: "0xstruct_hop",
      value: "100000000", // $100 USDT each (total $1,000)
      tokenSymbol: "USDT",
      tokenDecimal: "6",
      contractAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7",
      blockNumber: "2",
      timeStamp: String(1700000000 + i * 100),
    } as TokenTransaction));

    mockGetTransactions.mockResolvedValue([]);
    mockGetTokenTransactions.mockImplementation(async (address: string) => {
      const addr = address.toLowerCase();
      if (addr === "0xstart") {
        return [...bigNeighbors, ...smurfTransfers];
      }
      if (addr === "0xstruct_hop") {
        return [
          {
            hash: "0xvasp_link",
            from: "0xstruct_hop",
            to: "0xvasp_target",
            value: "1000000000", // $1,000 USDT
            tokenSymbol: "USDT",
            tokenDecimal: "6",
            contractAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7",
            blockNumber: "3",
            timeStamp: "1700002000",
          } as TokenTransaction,
        ];
      }
      return [];
    });

    const vaspSet = new Set(["0xvasp_target"]);
    // maxDepth = 2, maxFanout = 15 (splits into 10 value, 5 structuring)
    const results = await findNearestVASP("0xstart", vaspSet, 2, 15);

    expect(results).toHaveLength(1);
    expect(results[0].nearestVASP).toBe("0xvasp_target");
    expect(results[0].depth).toBe(2);
    expect(results[0].path).toEqual(["0xstart", "0xstruct_hop", "0xvasp_target"]);

    // The hop to 0xstruct_hop at index 1 was included via structuring signal
    expect(results[0].structuringFlaggedHops).toContain(1);
  });

  it("verifies negative case: pure value ranking alone drops 0xstruct_hop and fails to find VASP", () => {
    // If we only used rankNeighborsByValue with budget 10:
    const txs: (Transaction | TokenTransaction)[] = [
      ...Array.from({ length: 12 }, (_, i) => ({
        hash: `0xbig_${i}`,
        from: "0xstart",
        to: `0xrandom_whale_${i}`,
        value: "10000000000", // $10,000 USDT
        tokenSymbol: "USDT",
        tokenDecimal: "6",
        contractAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7",
        blockNumber: "1",
        timeStamp: "1700000000",
      } as TokenTransaction)),
      ...Array.from({ length: 10 }, (_, i) => ({
        hash: `0xsmurf_${i}`,
        from: "0xstart",
        to: "0xstruct_hop",
        value: "100000000", // $100 USDT each (total $1,000)
        tokenSymbol: "USDT",
        tokenDecimal: "6",
        contractAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7",
        blockNumber: "2",
        timeStamp: String(1700000000 + i * 100),
      } as TokenTransaction)),
    ];

    const neighborMap = extractNormalizedNeighbors(txs, "0xstart");

    // Pure value ranking top 10:
    const valueRanked = rankNeighborsByValue(neighborMap, 10);
    expect(valueRanked).not.toContain("0xstruct_hop"); // Dropped in pure value ranking!

    // Structuring ranking top 5:
    const structRanked = rankNeighborsByStructuringSignal(neighborMap, 5);
    expect(structRanked).toContain("0xstruct_hop"); // Recovered by structuring ranking!
  });

  it("finds VASP via structuring pattern while a control case (same wallet, no structuring pattern) is NOT found", async () => {
    // 12 whale transfers ($10,000 each)
    const bigNeighbors = Array.from({ length: 12 }, (_, i) => ({
      hash: `0xbig_${i}`,
      from: "0xstart",
      to: `0xrandom_whale_${i}`,
      value: "10000000000", // $10,000 USDT
      tokenSymbol: "USDT",
      tokenDecimal: "6",
      contractAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7",
      blockNumber: "1",
      timeStamp: "1700000000",
    } as TokenTransaction));

    // CONTROL CASE: A single transfer of $1,000 (same total value, but txCount=1, no structuring signature)
    const controlTransfer: TokenTransaction = {
      hash: "0xcontrol_single",
      from: "0xstart",
      to: "0xcontrol_hop",
      value: "1000000000", // $1,000 USDT in a single transfer
      tokenSymbol: "USDT",
      tokenDecimal: "6",
      contractAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7",
      blockNumber: "2",
      timeStamp: "1700000000",
    };

    mockGetTransactions.mockResolvedValue([]);
    mockGetTokenTransactions.mockImplementation(async (address: string) => {
      const addr = address.toLowerCase();
      if (addr === "0xstart") {
        return [...bigNeighbors, controlTransfer];
      }
      if (addr === "0xcontrol_hop") {
        return [
          {
            hash: "0xvasp_link",
            from: "0xcontrol_hop",
            to: "0xvasp_target",
            value: "1000000000",
            tokenSymbol: "USDT",
            tokenDecimal: "6",
            contractAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7",
            blockNumber: "3",
            timeStamp: "1700002000",
          } as TokenTransaction,
        ];
      }
      return [];
    });

    const vaspSet = new Set(["0xvasp_target"]);
    // In this control case, 0xcontrol_hop has txCount=1 (structuring score = 0)
    // and its $1,000 value ranks 13th (below the 12 $10k transfers).
    // Thus it is NOT expanded, and the VASP is NOT found:
    const controlResults = await findNearestVASP("0xstart", vaspSet, 2, 15);
    expect(controlResults).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// findNearestVASP bridge-exit detection (X-2)
// ──────────────────────────────────────────────────────────────────────────────

describe("findNearestVASP bridge-exit detection", () => {
  beforeEach(() => {
    mockGetTransactions.mockReset();
    mockGetTokenTransactions.mockReset().mockResolvedValue([]);
  });

  it("detects cross-chain bridge exit, terminates branch, and flags traceExitedToBridge", async () => {
    // Graph:
    // start -> 0x4dbd4fc535ac27206064b68ffcf827b0a60bab3f (Arbitrum One: Inbox)
    const bridgeAddr = "0x4dbd4fc535ac27206064b68ffcf827b0a60bab3f";

    mockGetTransactions.mockImplementation(async (address: string) => {
      const addr = address.toLowerCase();
      if (addr === "0xstart") {
        return [
          {
            hash: "0xbridge_tx",
            from: "0xstart",
            to: bridgeAddr,
            value: "5000000000000000000", // 5 ETH to bridge
            blockNumber: "100",
            timeStamp: "1700000000",
          },
        ];
      }
      if (addr === bridgeAddr) {
        // Even if the bridge contract has subsequent transactions, BFS must NOT expand them
        return [
          {
            hash: "0xsubsequent",
            from: bridgeAddr,
            to: "0xvasp_behind_bridge",
            value: "1000",
            blockNumber: "101",
            timeStamp: "1700000100",
          },
        ];
      }
      return [];
    });

    const vaspSet = new Set(["0xvasp_behind_bridge"]);
    const results = await findNearestVASP("0xstart", vaspSet, 3, 15);

    // No VASP reached on Ethereum
    expect(results).toHaveLength(0);
    // Bridge exit detected
    expect(results.traceExitedToBridge).toBe(true);
    expect(results.bridgeExitPoints).toHaveLength(1);
    expect(results.bridgeExitPoints[0].address).toBe(bridgeAddr);
    expect(results.bridgeExitPoints[0].label).toContain("Arbitrum");
    expect(results.bridgeExitPoints[0].hopIndex).toBe(1);
    expect(results.bridgeExitPoints[0].pathIndex).toBe(0);

    // Verify bridge was NOT expanded
    expect(mockGetTransactions).not.toHaveBeenCalledWith(bridgeAddr);
  });

  it("returns immediately at depth 0 if start wallet is itself a bridge contract", async () => {
    const bridgeAddr = "0xbeb5fc579115071764c7423a4f12edde41f104ed"; // Optimism Portal
    const vaspSet = new Set(["0xsome_vasp"]);

    const results = await findNearestVASP(bridgeAddr, vaspSet, 3, 15);

    expect(results).toHaveLength(0);
    expect(results.traceExitedToBridge).toBe(true);
    expect(results.bridgeExitPoints).toHaveLength(1);
    expect(results.bridgeExitPoints[0].address).toBe(bridgeAddr);
    expect(results.bridgeExitPoints[0].label).toContain("Optimism");
    expect(results.bridgeExitPoints[0].hopIndex).toBe(0);
    expect(mockGetTransactions).not.toHaveBeenCalled();
  });
});
