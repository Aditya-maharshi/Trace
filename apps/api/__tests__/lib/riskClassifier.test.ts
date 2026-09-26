/**
 * __tests__/lib/riskClassifier.test.ts
 *
 * Unit tests for the risk classifier (Phase 6).
 *
 * Tests that each typology fires on crafted test data AND does not fire on
 * clean data. No network calls — all inputs are in-process test fixtures.
 */

import { describe, it, expect } from "vitest";
import { classify, hasHighSeverityTypology } from "../../lib/domains/tracing/riskClassifier";
import type { ScoredAttribution } from "@sih/shared-types";

// ─────────────────────────────────────────────────────────────────────────────
// Fixture builder helpers
// ─────────────────────────────────────────────────────────────────────────────

function makePath(path: string[], score = 1.0, totalValueUSD = 1000): ScoredAttribution {
  return {
    vasp: path[path.length - 1],
    hops: path.length - 1,
    path,
    score,
    assetsInvolved: ["ETH"],
    breakdown: {
      hops: path.length - 1,
      totalValueUSD,
      daysSinceLastTx: 10,
      taintFraction: 1.0,
      score,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test: Peeling Chain
// ─────────────────────────────────────────────────────────────────────────────

describe("Typology: peeling_chain", () => {
  it("fires when path has 4+ hops with single output", () => {
    const paths: ScoredAttribution[] = [
      makePath(["0xA", "0xB", "0xC", "0xD", "0xE"]), // 4 hops — above threshold
    ];
    const result = classify({ paths });
    const typology = result.find((t) => t.name === "peeling_chain");
    expect(typology).toBeDefined();
    expect(typology?.severity).toBe("HIGH");
  });

  it("does NOT fire for short paths (< 4 hops)", () => {
    const paths: ScoredAttribution[] = [
      makePath(["0xA", "0xB", "0xC"]), // 2 hops — below threshold
    ];
    const result = classify({ paths });
    expect(result.find((t) => t.name === "peeling_chain")).toBeUndefined();
  });

  it("evidence array contains all hop addresses", () => {
    const addr = ["0xA", "0xB", "0xC", "0xD", "0xE"];
    const result = classify({ paths: [makePath(addr)] });
    const typology = result.find((t) => t.name === "peeling_chain");
    expect(typology?.evidence).toEqual(addr);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test: Smurfing
// ─────────────────────────────────────────────────────────────────────────────

describe("Typology: smurfing", () => {
  it("fires when wallet sends to >= 5 distinct addresses at hop 1", () => {
    const source = "0xORIGIN";
    const paths: ScoredAttribution[] = [
      makePath([source, "0xR1"]),
      makePath([source, "0xR2"]),
      makePath([source, "0xR3"]),
      makePath([source, "0xR4"]),
      makePath([source, "0xR5"]),
    ];
    const result = classify({ paths });
    const typology = result.find((t) => t.name === "smurfing");
    expect(typology).toBeDefined();
    expect(typology?.severity).toBe("HIGH");
    expect(typology?.evidence).toContain(source);
  });

  it("does NOT fire with < 5 distinct hop-1 destinations", () => {
    const source = "0xORIGIN";
    const paths: ScoredAttribution[] = [
      makePath([source, "0xR1"]),
      makePath([source, "0xR2"]),
      makePath([source, "0xR3"]),
    ];
    const result = classify({ paths });
    expect(result.find((t) => t.name === "smurfing")).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test: Mixer Proximity
// ─────────────────────────────────────────────────────────────────────────────

describe("Typology: mixer_proximity", () => {
  // Known Tornado Cash address from mixerLabels.ts
  const TORNADO_10ETH = "0x910cbd523d972eb0a6f4cae4618ad62622b39dbf";

  it("fires when a known mixer address appears within 3 hops", () => {
    const paths: ScoredAttribution[] = [
      makePath(["0xVICTIM", "0xHOP1", TORNADO_10ETH]),
    ];
    const result = classify({ paths });
    const typology = result.find((t) => t.name === "mixer_proximity");
    expect(typology).toBeDefined();
    expect(typology?.severity).toBe("HIGH");
    expect(typology?.evidence.some((e) => e.includes(TORNADO_10ETH))).toBe(true);
  });

  it("does NOT fire when mixer is beyond 3 hops", () => {
    const paths: ScoredAttribution[] = [
      makePath(["0xVICTIM", "0xHOP1", "0xHOP2", "0xHOP3", TORNADO_10ETH]), // hop index 4 > 3
    ];
    const result = classify({ paths });
    // hop index is 4 (index in path array) — should not fire
    expect(result.find((t) => t.name === "mixer_proximity")).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test: Sanctioned Proximity
// ─────────────────────────────────────────────────────────────────────────────

describe("Typology: sanctioned_proximity", () => {
  const SANCTIONED = "0xsanctioned000000000000000000000000000001";

  it("fires when a sanctioned address appears within 2 hops", () => {
    const paths: ScoredAttribution[] = [
      makePath(["0xVICTIM", SANCTIONED]),
    ];
    const sanctionedAddresses = new Set([SANCTIONED]);
    const result = classify({ paths, sanctionedAddresses });
    const typology = result.find((t) => t.name === "sanctioned_proximity");
    expect(typology).toBeDefined();
    expect(typology?.severity).toBe("HIGH");
  });

  it("does NOT fire with empty sanctioned set", () => {
    const paths: ScoredAttribution[] = [
      makePath(["0xVICTIM", SANCTIONED]),
    ];
    const result = classify({ paths, sanctionedAddresses: new Set() });
    expect(result.find((t) => t.name === "sanctioned_proximity")).toBeUndefined();
  });

  it("does NOT fire when sanctioned address is beyond 2 hops", () => {
    const paths: ScoredAttribution[] = [
      makePath(["0xVICTIM", "0xHOP1", "0xHOP2", SANCTIONED]), // hop index 3 > 2
    ];
    const result = classify({ paths, sanctionedAddresses: new Set([SANCTIONED]) });
    expect(result.find((t) => t.name === "sanctioned_proximity")).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test: Ransomware Pattern
// ─────────────────────────────────────────────────────────────────────────────

describe("Typology: ransomware_pattern", () => {
  it("fires when wallet fans out to >= 4 recipients with high total outflow", () => {
    const source = "0xRANSOM";
    const paths: ScoredAttribution[] = [
      makePath([source, "0xR1"], 1, 2000),
      makePath([source, "0xR2"], 1, 2000),
      makePath([source, "0xR3"], 1, 2000),
      makePath([source, "0xR4"], 1, 2000),
    ];
    const result = classify({ paths });
    const typology = result.find((t) => t.name === "ransomware_pattern");
    expect(typology).toBeDefined();
    expect(typology?.severity).toBe("MEDIUM"); // ransomware is always MEDIUM
  });

  it("does NOT fire with low total outflow even with fan-out", () => {
    const source = "0xRANSOM";
    const paths: ScoredAttribution[] = [
      makePath([source, "0xR1"], 1, 100), // $100 each — total $400 < $5000 threshold
      makePath([source, "0xR2"], 1, 100),
      makePath([source, "0xR3"], 1, 100),
      makePath([source, "0xR4"], 1, 100),
    ];
    const result = classify({ paths });
    expect(result.find((t) => t.name === "ransomware_pattern")).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test: hasHighSeverityTypology
// ─────────────────────────────────────────────────────────────────────────────

describe("hasHighSeverityTypology", () => {
  it("returns true when any typology is HIGH", () => {
    expect(hasHighSeverityTypology([
      { name: "mixer_proximity", description: "", severity: "HIGH", evidence: [] },
    ])).toBe(true);
  });

  it("returns false when all typologies are MEDIUM or LOW", () => {
    expect(hasHighSeverityTypology([
      { name: "ransomware_pattern", description: "", severity: "MEDIUM", evidence: [] },
    ])).toBe(false);
  });

  it("returns false for empty array", () => {
    expect(hasHighSeverityTypology([])).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test: Output ordering (HIGH before MEDIUM)
// ─────────────────────────────────────────────────────────────────────────────

describe("classify output ordering", () => {
  it("orders HIGH severity before MEDIUM severity", () => {
    const source = "0xORIGIN";
    const TORNADO_10ETH = "0x910cbd523d972eb0a6f4cae4618ad62622b39dbf";

    const paths: ScoredAttribution[] = [
      // triggers ransomware (MEDIUM) via fan-out
      makePath([source, "0xR1"], 1, 2000),
      makePath([source, "0xR2"], 1, 2000),
      makePath([source, "0xR3"], 1, 2000),
      makePath([source, "0xR4"], 1, 2000),
      // triggers mixer_proximity (HIGH)
      makePath([source, TORNADO_10ETH], 1, 1000),
    ];

    const result = classify({ paths });
    if (result.length >= 2) {
      const firstSeverity = result[0].severity;
      const lastSeverity = result[result.length - 1].severity;
      const severityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      expect(severityOrder[firstSeverity]).toBeLessThanOrEqual(severityOrder[lastSeverity]);
    }
  });
});
