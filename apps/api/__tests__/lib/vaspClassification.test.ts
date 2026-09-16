import { describe, it, expect } from "vitest";
import { getVaspClassification, getInstrumentsForClassification } from "../../lib/domains/compliance/vaspClassification";

describe("vaspClassification", () => {
  it("classifies onshore registered entities correctly", () => {
    const details = getVaspClassification("WazirX 2");
    expect(details.classification).toBe("onshore_registered");
    expect(details.availableInstruments).toContain("SAHYOG");
    expect(details.availableInstruments).not.toContain("MLAT");
  });

  it("classifies offshore registered entities correctly", () => {
    const details = getVaspClassification("Binance Hot Wallet");
    expect(details.classification).toBe("offshore_registered");
    expect(details.availableInstruments).toContain("SAHYOG");
    expect(details.availableInstruments).toContain("MLAT");
  });

  it("classifies offshore non-compliant entities correctly", () => {
    const details = getVaspClassification("Bitfinex 5");
    expect(details.classification).toBe("offshore_non_compliant");
    expect(details.availableInstruments).toContain("BLOCKING_ORDER");
    expect(details.availableInstruments).toContain("MLAT");
  });

  it("classifies unknown entities correctly", () => {
    const details = getVaspClassification("Some Unknown Exchange");
    expect(details.classification).toBe("unknown");
    expect(details.availableInstruments).toContain("MLAT");
  });

  it("handles null input gracefully", () => {
    const details = getVaspClassification(null);
    expect(details.classification).toBe("unknown");
  });
});
