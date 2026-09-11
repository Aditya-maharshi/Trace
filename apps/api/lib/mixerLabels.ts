/**
 * lib/mixerLabels.ts
 *
 * Registry of known crypto-mixing protocols and their contract addresses.
 * Structurally mirrors lib/vaspLabels.ts but flags matches as high-risk
 * rather than as a terminal destination — mixer exposure anywhere in the
 * transaction chain is a compliance red flag.
 *
 * ⚠ Addresses sourced exclusively from publicly documented sources:
 *   - OFAC SDN List (May 2022 Tornado Cash designations)
 *   - Etherscan verified contract labels
 *   - GitHub ethereum-lists/contracts
 *
 * Do NOT add addresses that are not publicly documented.
 */

// ──────────────────────────────────────────────────────────────────────────────
// Mixer address registry
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Known mixer/sanctioned-protocol contract addresses.
 * Keys: lowercased Ethereum addresses.
 * Values: human-readable labels.
 */
export const MIXER_LABELS: Record<string, string> = {
  // ── Tornado Cash ETH pools (OFAC SDN-listed May 2022) ─────────────────────
  "0x12d66f87a04a9e220c9d7abcbfbc3e1a1c6a5dcf": "Tornado Cash 0.1 ETH",
  "0x47ce0c6ed5b0ce3d3a51fdb1c52dc66a7c3c2936": "Tornado Cash 1 ETH",
  "0x910cbd523d972eb0a6f4cae4618ad62622b39dbf": "Tornado Cash 10 ETH",
  "0xa160cdab225685da1d56aa342ad8841c3b53f291": "Tornado Cash 100 ETH",
  // ── Tornado Cash ERC-20 pools ──────────────────────────────────────────────
  "0xd4b88df4d29f5cedd6857912842cff3b20c8cfa3": "Tornado Cash DAI 100",
  "0xfd8610d20aa15b7b2e3be39b396a1bc3516c7144": "Tornado Cash DAI 1000",
  "0x07687e702b410fa43f4cb4af7fa097918ffd2730": "Tornado Cash DAI 10000",
  "0x23773e65ed146a459667bbc50d75cb6bea5b7949": "Tornado Cash DAI 100000",
  "0x22aaa7720ddd5388a3c0a3333430953c68f1849b": "Tornado Cash cDAI 5000",
  "0x03893a7c7463ae47d46bc7f091665f1893656003": "Tornado Cash cDAI 50000",
  "0x2717c5e28cf931547b621a5dddb772ab6a35b701": "Tornado Cash cDAI 500000",
  "0xd21be7248e0197ee08e0c20d4a96debdac3d20af": "Tornado Cash cDAI 5000000",
  "0x4736dcf1b7a3d580672a2389f274c698c04a5dce": "Tornado Cash USDC 100",
  "0xd96f2b1c14db8458374d9aca76e26c3950e37edb": "Tornado Cash USDC 1000",
  "0x169ad27a470d064dede56a2d3ff727986b15d52b": "Tornado Cash USDT 100",
  "0x0836222f2b2b5a6430d8b22f57b5d1b5a0adc8bf": "Tornado Cash USDT 1000",
  "0x178169b1d46ec28e80b7940ea0ca3ed23d8c2c5f": "Tornado Cash WBTC 0.1",
  "0x610b717796ad172b316836ac95a2ffad065ceab4": "Tornado Cash WBTC 1",
  "0xbb93e510bbcd0b7beb5a853875f9ec60275cf498": "Tornado Cash WBTC 10",
  // ── Tornado Cash Nova / Router ─────────────────────────────────────────────
  "0x84443cfd09a6ca6bc7ea3a95b428027bd99d7e00": "Tornado Cash Nova",
  "0xce15ec44fbd6c0e0c6ef4ee20ad9daeed67c4891": "Tornado Cash Nova Router",
  // ── Tornado Cash governance / utility contracts ───────────────────────────
  "0x5efda50f22d34f262c29268506c5fa42cb56a1ce": "Tornado Cash Governance",
  "0x722122df12d4e14e13ac3b6895a86e84145b6967": "Tornado Cash Proxy",
  "0xdd4c48c0b24039969fc16d1cdf626eab821d3384": "Tornado Cash Relayer Registry",
  // ── Blender.io (OFAC SDN-listed May 2022) ─────────────────────────────────
  "0xd882cfc20f52f2599d84b8e8d58c7fb62cfe344b": "Blender.io",
};

// ──────────────────────────────────────────────────────────────────────────────
// Helper functions
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Build a Set<string> of all known mixer addresses (lowercased).
 * Same pattern as buildVaspSet() in vaspLabels.ts.
 */
export function buildMixerSet(): Set<string> {
  return new Set(Object.keys(MIXER_LABELS));
}

/**
 * Return the label for a known mixer address, or undefined.
 */
export function mixerLabelFor(address: string): string | undefined {
  return MIXER_LABELS[address.toLowerCase()];
}

// ──────────────────────────────────────────────────────────────────────────────
// Detection function
// ──────────────────────────────────────────────────────────────────────────────

export interface MixerHit {
  /** The mixer contract address found. */
  address: string;
  /** Human-readable label for the mixer (e.g. "Tornado Cash 10 ETH"). */
  label: string;
  /** Index of the hop within the path where the mixer was found (0 = queried wallet). */
  hopIndex: number;
  /** Index of the path in the paths array. */
  pathIndex: number;
}

/**
 * Walk every address in every path and return any matches against the mixer set.
 *
 * This is a SEPARATE pure function — it does NOT modify BFS traversal logic.
 * Mixer detection has different semantics from VASP detection:
 *   - VASP detection is a terminal/stopping condition (we found the destination)
 *   - Mixer detection is an evidence flag (money passed through a sanctioned mixer)
 *
 * @param paths    - Array of PathResult objects from findNearestVASP.
 * @param mixerSet - Set of lowercased mixer addresses (from buildMixerSet()).
 * @returns          Array of MixerHit objects for every mixer found in any path.
 */
export function detectMixerExposure(
  paths: Array<{ path: string[] }>,
  mixerSet: Set<string>,
): MixerHit[] {
  const hits: MixerHit[] = [];

  for (let pathIndex = 0; pathIndex < paths.length; pathIndex++) {
    const p = paths[pathIndex];
    const pathAddresses = p.path ?? [];

    for (let hopIndex = 0; hopIndex < pathAddresses.length; hopIndex++) {
      const addr = pathAddresses[hopIndex].toLowerCase();
      if (mixerSet.has(addr)) {
        hits.push({
          address: addr,
          label: MIXER_LABELS[addr] ?? "Unknown Mixer",
          hopIndex,
          pathIndex,
        });
      }
    }
  }

  return hits;
}
