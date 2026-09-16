import { describe, it, expect, vi, beforeEach } from "vitest";
import { findNearestVASP } from "../lib/domains/tracing/graphBuilder";

vi.mock("../lib/domains/tracing/etherscan", () => {
  return {
    getTransactions: vi.fn(),
    getTokenTransactions: vi.fn(),
  };
});

import { getTransactions, getTokenTransactions } from "../lib/domains/tracing/etherscan";

// Mock sanctions logic
vi.mock("../lib/domains/compliance/sanctions", () => {
  return {
    checkSanctions: vi.fn(async (addresses: string[]) => {
      // Mock that "0xbadbadbadbadbadbadbadbadbadbadbadbadbadb" is sanctioned
      const sanctionedList = addresses.map((a) => ({
        address: a,
        sanctioned: a.toLowerCase() === "0xbadbadbadbadbadbadbadbadbadbadbadbadbadb",
        matchCount: a.toLowerCase() === "0xbadbadbadbadbadbadbadbadbadbadbadbadbadb" ? 1 : 0,
        checkedAt: new Date().toISOString()
      }));
      return sanctionedList.filter(s => s.sanctioned);
    })
  };
});

describe("BFS Graph Builder Edge Cases", () => {
  const vaspSet = new Set(["0xvasp111111111111111111111111111111111111"]);

  beforeEach(() => {
    vi.clearAllMocks();
    (getTokenTransactions as any).mockResolvedValue([]);
  });

  it("handles a wallet with zero transactions gracefully", async () => {
    (getTransactions as any).mockResolvedValue([]);
    const startWallet = "0x0000000000000000000000000000000000000000";
    
    const result = await findNearestVASP(startWallet, vaspSet);
    
    expect(result).toHaveLength(0);
    expect(result.traceExitedToBridge).toBe(false);
  });

  it("handles a cyclical transaction graph without infinite looping", async () => {
    // A -> B -> A
    (getTransactions as any).mockImplementation(async (address: string) => {
      if (address === "0xa") {
        return [{ hash: "1", from: "0xa", to: "0xb", value: "100", timeStamp: "1000" }];
      } else if (address === "0xb") {
        return [{ hash: "2", from: "0xb", to: "0xa", value: "100", timeStamp: "1001" }];
      }
      return [];
    });

    const result = await findNearestVASP("0xa", vaspSet, 2, 5);
    // It should explore A, B, and then stop because A is already visited
    expect(result).toHaveLength(0);
  });

  it("returns immediately if start wallet is itself a VASP", async () => {
    const startWallet = "0xvasp111111111111111111111111111111111111";
    const result = await findNearestVASP(startWallet, vaspSet);
    
    expect(result).toHaveLength(1);
    expect(result[0].address).toBe(startWallet);
    expect(result[0].depth).toBe(0);
    expect(getTransactions).not.toHaveBeenCalled();
  });

  it("gracefully aborts when max depth is reached", async () => {
    // Chain: 1 -> 2 -> 3 -> 4 -> 5
    (getTransactions as any).mockImplementation(async (address: string) => {
      const match = address.match(/0x(\d)/);
      if (match) {
        const num = parseInt(match[1]);
        if (num < 5) {
          return [{ hash: String(num), from: address, to: `0x${num + 1}`, value: "100", timeStamp: "1000" }];
        }
      }
      return [];
    });

    // maxDepth = 2
    const result = await findNearestVASP("0x1", vaspSet, 2, 5);
    
    expect(result).toHaveLength(0); // Since no VASP is found within depth 2
  });
});
