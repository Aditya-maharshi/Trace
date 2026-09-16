/**
 * __tests__/lib/attribution.test.ts
 *
 * Unit tests for lib/attribution.ts — scoring, confidence, and conversion functions.
 * Every assertion uses hand-computed expected values, not "returns a number."
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  weiToUSD,
  tokenValueToUSD,
  txValueToUSD,
  daysSince,
  scorePath,
  combineScores,
  toConfidence,
  aggregateAttributions,
} from "../../lib/domains/tracing/attribution";
import type { PathResult } from "../../lib/domains/tracing/graphBuilder";
import type { Transaction, TokenTransaction } from "../../lib/domains/tracing/etherscan";

// ──────────────────────────────────────────────────────────────────────────────
// weiToUSD — precision and rounding
// ──────────────────────────────────────────────────────────────────────────────

describe("weiToUSD", () => {
  it("converts exactly 1 ETH (10^18 wei) to $2500", () => {
    // 1 ETH × $2500/ETH = $2500
    expect(weiToUSD("1000000000000000000")).toBe(2500);
  });

  it("converts 0.5 ETH to $1250", () => {
    expect(weiToUSD("500000000000000000")).toBe(1250);
  });

  it("converts 0.001 ETH to $2.50", () => {
    // 10^15 wei = 0.001 ETH → $2.50
    expect(weiToUSD("1000000000000000")).toBe(2.5);
  });

  it("converts a large value (100 ETH) correctly", () => {
    // 100 × 10^18 wei = 100 ETH → $250,000
    expect(weiToUSD("100000000000000000000")).toBe(250_000);
  });

  it("returns 0 for zero wei", () => {
    expect(weiToUSD("0")).toBe(0);
  });

  it("returns 0 for empty string", () => {
    expect(weiToUSD("")).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// daysSince — relative time calculation
// ──────────────────────────────────────────────────────────────────────────────

describe("daysSince", () => {
  beforeEach(() => {
    // Fix Date.now() to a known value: 2026-01-15T00:00:00Z = 1768435200000 ms
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 0 for a timestamp right now", () => {
    // Unix timestamp in seconds for 2026-01-15T00:00:00Z
    const nowSec = String(Math.floor(new Date("2026-01-15T00:00:00Z").getTime() / 1000));
    expect(daysSince(nowSec)).toBe(0);
  });

  it("returns exactly 10 for a timestamp 10 days ago", () => {
    const tenDaysAgoMs = new Date("2026-01-05T00:00:00Z").getTime();
    const tenDaysAgoSec = String(Math.floor(tenDaysAgoMs / 1000));
    expect(daysSince(tenDaysAgoSec)).toBeCloseTo(10, 5);
  });

  it("returns exactly 100 for a timestamp 100 days ago", () => {
    const hundredDaysAgoMs = new Date("2025-10-07T00:00:00Z").getTime();
    const hundredDaysAgoSec = String(Math.floor(hundredDaysAgoMs / 1000));
    expect(daysSince(hundredDaysAgoSec)).toBeCloseTo(100, 5);
  });

  it("clamps to 0 for future timestamps (never returns negative)", () => {
    const futureSec = String(Math.floor(new Date("2026-02-01T00:00:00Z").getTime() / 1000));
    expect(daysSince(futureSec)).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// scorePath — the core scoring formula
// ──────────────────────────────────────────────────────────────────────────────

describe("scorePath", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 0 when transaction list is empty", () => {
    const path: PathResult = {
      address: "0xabc",
      depth: 2,
      path: ["0xabc", "0xdef", "0xvasp"],
      nearestVASP: "0xvasp",
    };
    expect(scorePath(path, [])).toBe(0);
  });

  it("computes correct score for a known fixture", () => {
    // Setup:
    //   depth = 2 → hops = 2
    //   txs: two transactions, 1 ETH each → totalValueUSD = 5000
    //   most recent timestamp: 10 days ago → recencyFactor = exp(-0.01 × 10) = exp(-0.1)
    //
    // Expected:
    //   score = (1/2) × ln(1 + 5000) × exp(-0.1)
    //         = 0.5 × ln(5001) × exp(-0.1)
    //         = 0.5 × 8.51749... × 0.90484...
    //         = 0.5 × 7.70717...
    //         = 3.85358...

    const path: PathResult = {
      address: "0xstart",
      depth: 2,
      path: ["0xstart", "0xmid", "0xvasp"],
      nearestVASP: "0xvasp",
    };

    // 10 days before 2026-01-15 = 2026-01-05T00:00:00Z
    const tenDaysAgoSec = String(Math.floor(new Date("2026-01-05T00:00:00Z").getTime() / 1000));

    const txs: Transaction[] = [
      {
        hash: "0xtx1",
        from: "0xstart",
        to: "0xmid",
        value: "1000000000000000000", // 1 ETH
        blockNumber: "1000",
        timeStamp: tenDaysAgoSec,
      },
      {
        hash: "0xtx2",
        from: "0xmid",
        to: "0xvasp",
        value: "1000000000000000000", // 1 ETH
        blockNumber: "1001",
        // 20 days ago — NOT the most recent
        timeStamp: String(Math.floor(new Date("2025-12-26T00:00:00Z").getTime() / 1000)),
      },
    ];

    const score = scorePath(path, txs);

    // Hand-computed expected value
    const totalUSD = 5000; // 2 × $2500
    const recency = Math.exp(-0.01 * 10);
    const expected = (1 / 2) * Math.log(1 + totalUSD) * recency;

    expect(score).toBeCloseTo(expected, 4);
    // Sanity check the expected value itself
    expect(expected).toBeCloseTo(3.8536, 3);
  });

  it("clamps depth=0 to hops=1 (start-wallet IS the VASP)", () => {
    const path: PathResult = {
      address: "0xvasp",
      depth: 0,
      path: ["0xvasp"],
      nearestVASP: "0xvasp",
    };

    const recentSec = String(Math.floor(new Date("2026-01-14T00:00:00Z").getTime() / 1000));

    const txs: Transaction[] = [
      {
        hash: "0xtx1",
        from: "0xsomeone",
        to: "0xvasp",
        value: "2000000000000000000", // 2 ETH = $5000
        blockNumber: "1000",
        timeStamp: recentSec,
      },
    ];

    const score = scorePath(path, txs);

    // hops clamped to 1, so (1/1) × ln(1 + 5000) × exp(-0.01 × 1)
    const expected = 1 * Math.log(1 + 5000) * Math.exp(-0.01 * 1);
    expect(score).toBeCloseTo(expected, 4);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// combineScores — aggregation
// ──────────────────────────────────────────────────────────────────────────────

describe("combineScores", () => {
  it("sums multiple scores correctly", () => {
    expect(combineScores([1.5, 2.3, 4.2])).toBeCloseTo(8.0, 10);
  });

  it("returns 0 for an empty array", () => {
    expect(combineScores([])).toBe(0);
  });

  it("returns the single score for a one-element array", () => {
    expect(combineScores([5.5])).toBe(5.5);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// toConfidence — boundary tests
//
// The function uses STRICT inequality:
//   score > 8  → "High"
//   score > 3  → "Medium"
//   otherwise  → "Low"
//
// So 8.0 exactly is NOT > 8, it should be "Medium".
// And 3.0 exactly is NOT > 3, it should be "Low".
// ──────────────────────────────────────────────────────────────────────────────

describe("toConfidence", () => {
  // ── High boundary ──
  it("returns 'High' for score just above 8", () => {
    expect(toConfidence(8.001)).toBe("High");
  });

  it("returns 'Medium' for score exactly 8 (strict >)", () => {
    expect(toConfidence(8)).toBe("Medium");
  });

  it("returns 'High' for a very large score", () => {
    expect(toConfidence(100)).toBe("High");
  });

  // ── Medium boundary ──
  it("returns 'Medium' for score just above 3", () => {
    expect(toConfidence(3.001)).toBe("Medium");
  });

  it("returns 'Low' for score exactly 3 (strict >)", () => {
    expect(toConfidence(3)).toBe("Low");
  });

  it("returns 'Medium' for score 7.999 (below High, above Low)", () => {
    expect(toConfidence(7.999)).toBe("Medium");
  });

  // ── Low ──
  it("returns 'Low' for score 0", () => {
    expect(toConfidence(0)).toBe("Low");
  });

  it("returns 'Low' for score 2.999", () => {
    expect(toConfidence(2.999)).toBe("Low");
  });

  it("returns 'Low' for negative score", () => {
    expect(toConfidence(-1)).toBe("Low");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// tokenValueToUSD & txValueToUSD
// ──────────────────────────────────────────────────────────────────────────────

describe("tokenValueToUSD", () => {
  it("converts 50,000 USDT (6 decimals) to $50,000", () => {
    expect(tokenValueToUSD("50000000000", "6", "USDT")).toBe(50_000);
  });

  it("converts 100 USDC (6 decimals) to $100", () => {
    expect(tokenValueToUSD("100000000", "6", "USDC")).toBe(100);
  });

  it("converts 250 DAI (18 decimals) to $250", () => {
    expect(tokenValueToUSD("250000000000000000000", "18", "DAI")).toBe(250);
  });

  it("converts 1.5 USDT correctly", () => {
    expect(tokenValueToUSD("1500000", "6", "USDT")).toBe(1.5);
  });

  it("returns 0 for empty or zero raw value", () => {
    expect(tokenValueToUSD("0", "6", "USDT")).toBe(0);
    expect(tokenValueToUSD("", "6", "USDT")).toBe(0);
  });
});

describe("txValueToUSD", () => {
  it("dispatches ETH txs to weiToUSD", () => {
    const ethTx: Transaction = {
      hash: "0x1",
      from: "0xa",
      to: "0xb",
      value: "1000000000000000000", // 1 ETH
      blockNumber: "1",
      timeStamp: "1000",
    };
    expect(txValueToUSD(ethTx)).toBe(2500);
  });

  it("dispatches ERC-20 token txs to tokenValueToUSD", () => {
    const usdtTx: TokenTransaction = {
      hash: "0x2",
      from: "0xa",
      to: "0xb",
      value: "50000000000", // 50,000 USDT
      tokenSymbol: "USDT",
      tokenDecimal: "6",
      contractAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7",
      blockNumber: "2",
      timeStamp: "1000",
    };
    expect(txValueToUSD(usdtTx)).toBe(50_000);
  });

  it("converts 6-decimal USDT to the exact same USD scale as 18-decimal ETH (no 18-decimal assumption bug)", () => {
    // 1 ETH (18 decimals) = $2,500 USD
    const ethTx: Transaction = {
      hash: "0xeth",
      from: "0xsender",
      to: "0xreceiver",
      value: "1000000000000000000", // 10^18 wei
      blockNumber: "1",
      timeStamp: "1000",
    };

    // 2,500 USDT (6 decimals) = $2,500 USD
    const usdtTx: TokenTransaction = {
      hash: "0xusdt",
      from: "0xsender",
      to: "0xreceiver",
      value: "2500000000", // 2,500 * 10^6
      tokenSymbol: "USDT",
      tokenDecimal: "6",
      contractAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7",
      blockNumber: "1",
      timeStamp: "1000",
    };

    const ethUsd = txValueToUSD(ethTx);
    const usdtUsd = txValueToUSD(usdtTx);

    expect(ethUsd).toBe(2500);
    expect(usdtUsd).toBe(2500);
    expect(usdtUsd).toEqual(ethUsd);
  });
});

describe("scorePath with mixed ETH and tokens", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("accurately sums mixed ETH and USDT flows without treating USDT as wei", () => {
    const path: PathResult = {
      address: "0xstart",
      depth: 2,
      path: ["0xstart", "0xmid", "0xvasp"],
      nearestVASP: "0xvasp",
    };

    const tenDaysAgoSec = String(Math.floor(new Date("2026-01-05T00:00:00Z").getTime() / 1000));

    const txs: (Transaction | TokenTransaction)[] = [
      // 1 ETH = $2500
      {
        hash: "0xtx1",
        from: "0xstart",
        to: "0xmid",
        value: "1000000000000000000",
        blockNumber: "1000",
        timeStamp: tenDaysAgoSec,
      },
      // 2500 USDT = $2500
      {
        hash: "0xtx2",
        from: "0xmid",
        to: "0xvasp",
        value: "2500000000",
        tokenSymbol: "USDT",
        tokenDecimal: "6",
        contractAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7",
        blockNumber: "1001",
        timeStamp: tenDaysAgoSec,
      },
    ];

    const score = scorePath(path, txs);

    // totalUSD = 2500 + 2500 = 5000 USD
    // hops = 2, recency = exp(-0.01 * 10)
    const expected = (1 / 2) * Math.log(1 + 5000) * Math.exp(-0.01 * 10);
    expect(score).toBeCloseTo(expected, 4);
  });
});

describe("aggregateAttributions assetsInvolved", () => {
  it("populates assetsInvolved with symbols of assets present", async () => {
    const paths: PathResult[] = [
      {
        address: "0xstart",
        depth: 1,
        path: ["0xstart", "0xvasp1"],
        nearestVASP: "0xvasp1",
      },
    ];

    const mockFetch = async () => [
      {
        hash: "0x1",
        from: "0xstart",
        to: "0xvasp1",
        value: "10000000000", // 10,000 USDT
        tokenSymbol: "USDT",
        tokenDecimal: "6",
        contractAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7",
        blockNumber: "1",
        timeStamp: "1700000000",
      } as TokenTransaction,
    ];

    const aggregated = await aggregateAttributions(paths, mockFetch);
    expect(aggregated).toHaveLength(1);
    expect(aggregated[0].paths[0].assetsInvolved).toEqual(["USDT"]);
  });
});

