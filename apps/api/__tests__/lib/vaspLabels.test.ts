/**
 * __tests__/lib/vaspLabels.test.ts
 *
 * Unit tests for lib/vaspLabels.ts — VASP label registry and dynamic dataset loading.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  VASP_LABELS,
  FALLBACK_VASP_LABELS,
  buildVaspSet,
  labelFor,
  getVaspLabels,
  clearVaspCache,
} from "../../lib/domains/tracing/vaspLabels";

describe("vaspLabels", () => {
  beforeEach(() => {
    clearVaspCache();
  });

  it("loads labels including the baseline exchanges", () => {
    const vaspSet = buildVaspSet();
    // At minimum, all 18 baseline addresses must be present
    expect(vaspSet.size).toBeGreaterThanOrEqual(Object.keys(FALLBACK_VASP_LABELS).length);

    // Baseline Binance hot wallet should be present
    const binanceAddr = "0xdfd5293d8e347dfe59e90efd55b2956a1343963d";
    expect(vaspSet.has(binanceAddr)).toBe(true);
    expect(labelFor(binanceAddr)).toMatch(/Binance/i);
  });

  it("loads expanded dataset from data/vasp_labels.json when present", () => {
    const labels = getVaspLabels();
    // When data/vasp_labels.json is present, total count should be >= 300
    expect(Object.keys(labels).length).toBeGreaterThanOrEqual(300);
  });

  it("labelFor resolves case-insensitively", () => {
    const krakenChecksum = "0x267be1C1D684F78cb4F6a176C4911B741E4Ffdc0";
    expect(labelFor(krakenChecksum)).toMatch(/Kraken/i);
  });

  it("returns undefined for unknown wallets", () => {
    expect(labelFor("0x1234567890123456789012345678901234567890")).toBeUndefined();
  });

  it("VASP_LABELS proxy mirrors getVaspLabels()", () => {
    expect(VASP_LABELS["0x3f5ce5fbfe3e9af3971dd833d26ba9b5c936f0be"]).toMatch(/Binance/i);
    expect("0x3f5ce5fbfe3e9af3971dd833d26ba9b5c936f0be" in VASP_LABELS).toBe(true);
    expect(Object.keys(VASP_LABELS).length).toBeGreaterThanOrEqual(300);
  });
});
