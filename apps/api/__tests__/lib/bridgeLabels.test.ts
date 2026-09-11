/**
 * __tests__/lib/bridgeLabels.test.ts
 *
 * Unit tests for lib/bridgeLabels.ts — Ethereum mainnet cross-chain bridge registry.
 */

import { describe, it, expect } from "vitest";
import {
  BRIDGE_LABELS,
  buildBridgeSet,
  labelForBridge,
  isBridge,
} from "../../lib/bridgeLabels";

describe("bridgeLabels", () => {
  it("contains registry of well-known bridges", () => {
    expect(Object.keys(BRIDGE_LABELS).length).toBeGreaterThanOrEqual(15);
  });

  it("buildBridgeSet returns all addresses lowercased", () => {
    const bridgeSet = buildBridgeSet();
    expect(bridgeSet.size).toBe(Object.keys(BRIDGE_LABELS).length);
    for (const addr of bridgeSet) {
      expect(addr).toBe(addr.toLowerCase());
      expect(addr).toMatch(/^0x[0-9a-f]{40}$/);
    }
  });

  it("correctly identifies Arbitrum, Optimism, Base, Polygon, and Avalanche bridges", () => {
    // Arbitrum One Inbox
    expect(isBridge("0x4dbd4fc535ac27206064b68ffcf827b0a60bab3f")).toBe(true);
    expect(labelForBridge("0x4dbd4fc535ac27206064b68ffcf827b0a60bab3f")).toContain("Arbitrum");

    // Optimism Portal
    expect(isBridge("0xbeb5fc579115071764c7423a4f12edde41f104ed")).toBe(true);
    expect(labelForBridge("0xbeb5fc579115071764c7423a4f12edde41f104ed")).toContain("Optimism");

    // Base Portal
    expect(isBridge("0x49048044d57e1c92a77f79988d21fa8faf74e97e")).toBe(true);
    expect(labelForBridge("0x49048044d57e1c92a77f79988d21fa8faf74e97e")).toContain("Base");

    // Polygon PoS ERC20 Bridge
    expect(isBridge("0x40ec5b33f54e0e8a33a975908c5ba1c14e5bbbdf")).toBe(true);
    expect(labelForBridge("0x40ec5b33f54e0e8a33a975908c5ba1c14e5bbbdf")).toContain("Polygon");

    // Avalanche Bridge
    expect(isBridge("0x8eb8a3b98659cce290402893d0123abb75e3ab28")).toBe(true);
    expect(labelForBridge("0x8eb8a3b98659cce290402893d0123abb75e3ab28")).toContain("Avalanche");
  });

  it("correctly identifies application bridges: Across, Hop, Stargate, Wormhole, Synapse, Ronin", () => {
    // Across
    expect(isBridge("0x5c7bcd6e7de5423a257d81b442095a1a6ced35c5")).toBe(true);
    // Hop
    expect(isBridge("0x3666f603cc164936c1b87e207f36beba4ac5f18a")).toBe(true);
    // Stargate
    expect(isBridge("0x296f55f0fb284e00226922874a557550157efb9e")).toBe(true);
    // Wormhole
    expect(isBridge("0x3ee18b2214aff97000d974cf647e7c347e8fa585")).toBe(true);
    // Synapse
    expect(isBridge("0x2796317b0ff8538f253012862c06787adfb8ceb6")).toBe(true);
    // Ronin
    expect(isBridge("0x1a2a1c938ce3fc391a7599f8666ae462c9579541")).toBe(true);
  });

  it("is case-insensitive", () => {
    const mixedCase = "0x4Dbd4fc535ac27206064B68FfCf827b0A60BAB3f";
    expect(isBridge(mixedCase)).toBe(true);
    expect(labelForBridge(mixedCase)).toContain("Arbitrum");
  });

  it("returns false / undefined for non-bridge addresses", () => {
    const regularWallet = "0x000000000000000000000000000000000000dead";
    expect(isBridge(regularWallet)).toBe(false);
    expect(labelForBridge(regularWallet)).toBeUndefined();
  });
});
