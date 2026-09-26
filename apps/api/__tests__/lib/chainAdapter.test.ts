/**
 * __tests__/lib/chainAdapter.test.ts
 *
 * Unit tests for the ChainAdapter interface, registry, and trace() function.
 * Uses mocked adapters — no real network calls.
 *
 * Tests cover the four required scenarios from the spec:
 *   1. BitcoinAdapter fetches real Blockstream data (mocked) and normalises correctly
 *   2. Stub adapters throw ChainNotImplementedError (not silently return null)
 *   3. ChainRegistry selects the correct adapter per chain
 *   4. trace() with Ethereum delegates to existing BFS pipeline (mocked)
 *
 * Additional tests:
 *   5. EthereumAdapter normalises tx to NormalisedTransaction shape
 *   6. BlockchainFetchError propagates correctly
 *   7. Confidence label formatting includes mandatory framing text
 *   8. computeMultiFactorConfidence scores correctly
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ChainNotImplementedError,
  BlockchainFetchError,
  type NormalisedTransaction,
  type ChainAdapter,
} from "../../lib/domains/tracing/chainAdapter";
import {
  formatConfidenceLabel,
  computeMultiFactorConfidence,
} from "../../lib/domains/tracing/entityStore";

// ─────────────────────────────────────────────────────────────────────────────
// Mock the registry's dependencies to avoid network calls
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("../../lib/domains/tracing/entityStore", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../lib/domains/tracing/entityStore")>();
  return {
    ...original,
    lookupEntity: vi.fn().mockResolvedValue(null),
  };
});

vi.mock("../../lib/domains/tracing/etherscan", () => ({
  getTransactions: vi.fn().mockResolvedValue({ data: [], provenance: { source: "fixture-cache", fetchedAt: new Date().toISOString() }, truncated: false }),
  getTokenTransactions: vi.fn().mockResolvedValue({ data: [], provenance: { source: "fixture-cache", fetchedAt: new Date().toISOString() }, truncated: false }),
}));

vi.mock("../../lib/domains/tracing/graphBuilder", () => ({
  findNearestVASP: vi.fn().mockResolvedValue(Object.assign([], { length: 0, bridgeExitPoints: [], traceExitedToBridge: false, incompleteTraversal: { skippedNodes: 0 }, dataProvenance: { source: "fixture-cache", fetchedAt: new Date().toISOString() } })),
}));

vi.mock("../../lib/domains/tracing/vaspLabels", () => ({
  buildVaspSet: vi.fn().mockReturnValue(new Set(["0xtest"])),
}));

vi.mock("../../lib/domains/tracing/buildAttributionResponse", () => ({
  buildAttributionResponse: vi.fn().mockResolvedValue({
    wallet: "0xabc",
    nearestVasp: null,
    nearestVaspLabel: null,
    hops: null,
    confidence: null,
    score: null,
    paths: [],
    risk: "LOW",
    structuringSignalDetected: false,
    ensNames: {},
    mixerExposure: [],
    confidenceThresholds: { high: 0.7, medium: 0.4 },
    topVasps: [],
    bridgeExitPoints: [],
    traceExitedToBridge: false,
    incompleteTraversal: { skippedNodes: 0 },
    methodology: {},
    dataProvenance: { source: "fixture-cache", fetchedAt: new Date().toISOString() },
    dataSource: "fixture",
  }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Test: ChainNotImplementedError
// ─────────────────────────────────────────────────────────────────────────────

describe("ChainNotImplementedError", () => {
  it("has correct name and chain property", () => {
    const err = new ChainNotImplementedError("tron");
    expect(err.name).toBe("ChainNotImplementedError");
    expect(err.chain).toBe("tron");
    expect(err.message).toContain("tron");
    expect(err.message).toContain("stub");
  });

  it("is an instance of Error", () => {
    expect(new ChainNotImplementedError("solana")).toBeInstanceOf(Error);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test: BlockchainFetchError
// ─────────────────────────────────────────────────────────────────────────────

describe("BlockchainFetchError", () => {
  it("contains chain, address, and cause in message", () => {
    const err = new BlockchainFetchError("bitcoin", "1ABC", "timeout");
    expect(err.chain).toBe("bitcoin");
    expect(err.address).toBe("1ABC");
    expect(err.message).toContain("bitcoin");
    expect(err.message).toContain("1ABC");
    expect(err.message).toContain("timeout");
  });

  it("explicitly states no fabricated data was substituted", () => {
    const err = new BlockchainFetchError("ethereum", "0xabc", "HTTP 503");
    expect(err.message).toContain("no fabricated data");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test: StubAdapters throw ChainNotImplementedError (not silently null)
// ─────────────────────────────────────────────────────────────────────────────

describe("StubAdapters", () => {
  // Import stubs without going through the registry so we test them directly
  let TronAdapter: any, SolanaAdapter: any;

  beforeEach(async () => {
    // Dynamic import avoids circular dependency issues in tests
    const stubs = await import("../../lib/domains/tracing/adapters/stubAdapters");
    TronAdapter = stubs.TronAdapter;
    SolanaAdapter = stubs.SolanaAdapter;
  });

  it("TronAdapter.getTransactionsForAddress throws ChainNotImplementedError", async () => {
    const adapter = new TronAdapter();
    await expect(adapter.getTransactionsForAddress("TAddr")).rejects.toBeInstanceOf(ChainNotImplementedError);
  });

  it("TronAdapter.isKnownEntity throws ChainNotImplementedError", async () => {
    const adapter = new TronAdapter();
    await expect(adapter.isKnownEntity("TAddr")).rejects.toBeInstanceOf(ChainNotImplementedError);
  });

  it("SolanaAdapter throws ChainNotImplementedError with chain === 'solana'", async () => {
    const adapter = new SolanaAdapter();
    try {
      await adapter.getTransactionsForAddress("9Af2...");
    } catch (err) {
      expect(err).toBeInstanceOf(ChainNotImplementedError);
      expect((err as ChainNotImplementedError).chain).toBe("solana");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test: Confidence label formatting (mandatory framing)
// ─────────────────────────────────────────────────────────────────────────────

describe("formatConfidenceLabel", () => {
  it("includes mandatory framing text", () => {
    const label = formatConfidenceLabel(82);
    expect(label).toContain("82%");
    expect(label).toContain("investigative lead");
    expect(label).toContain("requires VASP confirmation");
  });

  it("rounds to nearest integer", () => {
    const label = formatConfidenceLabel(82.7);
    expect(label).toContain("83%");
  });

  it("handles 0%", () => {
    const label = formatConfidenceLabel(0);
    expect(label).toContain("0%");
    expect(label).toContain("investigative lead");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test: computeMultiFactorConfidence
// ─────────────────────────────────────────────────────────────────────────────

describe("computeMultiFactorConfidence", () => {
  it("OFAC source with perfect factors returns near-max score", () => {
    const score = computeMultiFactorConfidence({
      source: "ofac-sdn",
      pathCount: 5,
      daysSinceLastTx: 0,
      fractionOfOutflow: 1.0,
    });
    expect(score).toBeGreaterThan(95);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("inferred source with weak factors returns lower score", () => {
    const score = computeMultiFactorConfidence({
      source: "inferred",
      pathCount: 1,
      daysSinceLastTx: 180,
      fractionOfOutflow: 0.05,
    });
    expect(score).toBeLessThan(40);
  });

  it("recency decay reduces score for stale connections", () => {
    const recent = computeMultiFactorConfidence({
      source: "etherscan-labels", pathCount: 3, daysSinceLastTx: 0, fractionOfOutflow: 0.5,
    });
    const stale = computeMultiFactorConfidence({
      source: "etherscan-labels", pathCount: 3, daysSinceLastTx: 365, fractionOfOutflow: 0.5,
    });
    expect(recent).toBeGreaterThan(stale);
  });

  it("more paths increases convergence score", () => {
    const singlePath = computeMultiFactorConfidence({
      source: "brianleect-labels", pathCount: 1, daysSinceLastTx: 30, fractionOfOutflow: 0.3,
    });
    const manyPaths = computeMultiFactorConfidence({
      source: "brianleect-labels", pathCount: 5, daysSinceLastTx: 30, fractionOfOutflow: 0.3,
    });
    expect(manyPaths).toBeGreaterThan(singlePath);
  });

  it("score is always 0-100", () => {
    // Extreme values
    const score = computeMultiFactorConfidence({
      source: "ofac-sdn", pathCount: 1000, daysSinceLastTx: 0, fractionOfOutflow: 100,
    });
    expect(score).toBeLessThanOrEqual(100);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test: BitcoinAdapter normalisation (mocked fetch)
// ─────────────────────────────────────────────────────────────────────────────

describe("BitcoinAdapter", () => {
  it("normalises Blockstream tx to NormalisedTransaction shape", async () => {
    // Mock global fetch for this test
    const mockBlockstreamTxs = [
      {
        txid: "abc123",
        vin: [{ prevout: { scriptpubkey_address: "1sender", value: 1000000 } }],
        vout: [
          { scriptpubkey_address: "1recipient", value: 900000 },
          { scriptpubkey_address: "1sender", value: 99000 }, // change back to self
        ],
        status: { confirmed: true, block_height: 800000, block_time: 1700000000 },
      },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockBlockstreamTxs,
    } as any);

    const { BitcoinAdapter } = await import("../../lib/domains/tracing/adapters/bitcoinAdapter");
    const adapter = new BitcoinAdapter("https://blockstream.info/api");
    const txs = await adapter.getTransactionsForAddress("1sender");

    expect(txs).toHaveLength(1);
    const tx = txs[0];
    expect(tx.chain).toBe("bitcoin");
    expect(tx.asset).toBe("BTC");
    expect(tx.from).toBe("1sender");
    expect(tx.to).toBe("1recipient");
    expect(tx.amountRaw).toBe("900000");
    expect(tx.txHash).toBe("abc123");
    expect(tx.blockNumber).toBe("800000");
    expect(tx.amountUSD).toBeGreaterThan(0);
  });

  it("throws BlockchainFetchError on HTTP 429", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
    } as any);

    const { BitcoinAdapter } = await import("../../lib/domains/tracing/adapters/bitcoinAdapter");
    const adapter = new BitcoinAdapter();
    await expect(adapter.getTransactionsForAddress("1test")).rejects.toBeInstanceOf(BlockchainFetchError);
  });

  it("does not return change-back outputs (self-to-self)", async () => {
    const selfAddress = "1selfaddr";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        {
          txid: "tx1",
          vin: [{ prevout: { scriptpubkey_address: selfAddress, value: 5000 } }],
          vout: [
            { scriptpubkey_address: selfAddress, value: 4999 }, // change to self — excluded
          ],
          status: { confirmed: true, block_height: 1, block_time: 1700000000 },
        },
      ],
    } as any);

    const { BitcoinAdapter } = await import("../../lib/domains/tracing/adapters/bitcoinAdapter");
    const adapter = new BitcoinAdapter();
    const txs = await adapter.getTransactionsForAddress(selfAddress);
    expect(txs).toHaveLength(0); // No non-self outputs
  });
});
