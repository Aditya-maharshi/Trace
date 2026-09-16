import { describe, it, expect, beforeEach } from "vitest";
import {
  storeAttributionResult,
  loadAttributionResult,
  resetInMemoryResultStore,
  isValidRequestId,
} from "../../lib/domains/core/resultStore";
import type { AttributionResponse } from "../../../../packages/shared-types";

const sample: AttributionResponse = {
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
  confidenceThresholds: { high: 8, medium: 3 },
  topVasps: [],
  bridgeExitPoints: [],
  traceExitedToBridge: false,
  incompleteTraversal: { skippedNodes: 0 },
  methodology: {
    notice: "",
    vaspRegistryNotice: "",
    sanctionsSource: "",
    humanReviewDisclaimer: "",
    calibrationDate: "",
    calibrationSample: "",
    calibratedHighThreshold: 0,
    calibratedLowThreshold: 0,
    activeHighThreshold: 0,
    activeLowThreshold: 0,
    limitationsDocument: "",
  },
  dataProvenance: { source: "fixture-cache", fetchedAt: "2026-01-01T00:00:00.000Z" },
  dataSource: "cached-fixture",
};

describe("resultStore", () => {
  beforeEach(() => {
    resetInMemoryResultStore();
  });

  it("accepts UUID request ids only", () => {
    expect(isValidRequestId("not-a-uuid")).toBe(false);
    expect(isValidRequestId("11111111-1111-4111-8111-111111111111")).toBe(true);
  });

  it("round-trips a stored attribution result", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    await storeAttributionResult(id, sample);
    const loaded = await loadAttributionResult(id);
    expect(loaded?.wallet).toBe("0xabc");
    expect(loaded?.requestId).toBe(id);
  });

  it("returns null for unknown ids", async () => {
    expect(await loadAttributionResult("11111111-1111-4111-8111-111111111112")).toBeNull();
  });
});
