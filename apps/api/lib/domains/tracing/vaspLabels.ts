/**
 * lib/vaspLabels.ts
 *
 * Registry of known Virtual Asset Service Provider (VASP) wallet addresses.
 * Loads comprehensive verified CEX addresses from `data/vasp_labels.json`
 * (sourced from open-source MIT dataset brianleect/etherscan-labels) with
 * graceful fallback to a curated static baseline.
 */

import fs from "fs";
import path from "path";

export const FALLBACK_VASP_LABELS: Record<string, string> = {
  "0xdfd5293d8e347dfe59e90efd55b2956a1343963d": "Binance Hot Wallet",
  "0x28c6c06298d514db089934071355e5743bf21d60": "Binance 14",
  "0x21a31ee1afc51d94c2efccaa2092ad1028285549": "Binance 15",
  "0x56eddb7aa87536c09ccc2793473599fd21a8b17f": "Binance 16",
  "0x3f5ce5fbfe3e9af3971dd833d26ba9b5c936f0be": "Binance 1",
  "0xd551234ae421e3bcba99a0da6d736074f22192ff": "Binance 2",
  "0x742d35cc6634c0532925a3b844bc9e7595f2bd1e": "Bitfinex",
  "0x876eabf441b2ee5b5b0554fd502a8e0600950cfa": "Bitfinex 5",
  "0x267be1c1d684f78cb4f6a176c4911b741e4ffdc0": "Kraken",
  "0xae2d4617c862309a3d75a0ffb358c7a5009c673f": "Kraken 10",
  "0x53d284357ec70ce289d6d64134dfac8e511c8a3d": "Kraken 4",
  "0x2910543af39aba0cd09dbb2d50200b3e800a63d2": "Kraken 6",
  "0xfdb16996831753d5331ff813c29a93c76834a0ad": "WazirX",
  "0x4976a4a02f38326660d17bf34b431dc6e2eb2327": "WazirX 2",
  "0x0d0707963952f2fba59dd06f2b425ace40b492fe": "Gate.io",
  "0x1c4b70a3968436b9a0a9cf5205c787eb81bb558c": "Gate.io 2",
  "0x2b5634c42055806a59e9107ed44d43c426e58258": "KuCoin",
  "0x689c56aef474df92d44a1b70850f808488f9769c": "KuCoin 2",
};

let cachedLabels: Record<string, string> | null = null;

/**
 * Load labels from data/vasp_labels.json if available, or use the fallback set.
 */
export function getVaspLabels(): Record<string, string> {
  if (cachedLabels) return cachedLabels;

  try {
    const primaryPath = path.join(process.cwd(), "data", "vasp_labels.json");
    const fallbackPath = path.join(process.cwd(), "Backend_1", "data", "vasp_labels.json");
    const targetPath = fs.existsSync(primaryPath)
      ? primaryPath
      : fs.existsSync(fallbackPath)
        ? fallbackPath
        : null;

    if (targetPath) {
      const raw = fs.readFileSync(targetPath, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.labels === "object") {
        cachedLabels = { ...FALLBACK_VASP_LABELS, ...parsed.labels };
        return cachedLabels!;
      }
    }
  } catch {
    // Non-fatal fallback
  }

  cachedLabels = { ...FALLBACK_VASP_LABELS };
  return cachedLabels;
}

/**
 * Reset in-memory cache (primarily for testing and after refresh script execution).
 */
export function clearVaspCache(): void {
  cachedLabels = null;
}

/**
 * Registry of known Virtual Asset Service Provider (VASP) wallet addresses.
 * Keys are lowercased Ethereum addresses; values are human-readable labels.
 */
export const VASP_LABELS: Record<string, string> = new Proxy(FALLBACK_VASP_LABELS, {
  get(target, prop: string) {
    const labels = getVaspLabels();
    return labels[prop] ?? target[prop];
  },
  has(target, prop: string) {
    const labels = getVaspLabels();
    return prop in labels || prop in target;
  },
  ownKeys() {
    return Object.keys(getVaspLabels());
  },
  getOwnPropertyDescriptor(target, prop: string) {
    const labels = getVaspLabels();
    if (prop in labels) {
      return {
        value: labels[prop],
        writable: true,
        enumerable: true,
        configurable: true,
      };
    }
    return undefined;
  },
});

/**
 * Build a Set<string> of all known VASP addresses (lowercased).
 * Feed this into `findNearestVASP(startWallet, vaspSet)`.
 */
export function buildVaspSet(): Set<string> {
  const labels = getVaspLabels();
  return new Set(Object.keys(labels).map((a) => a.toLowerCase()));
}

/**
 * Given an address that is known to be a VASP, return its label (or undefined).
 */
export function labelFor(address: string): string | undefined {
  const labels = getVaspLabels();
  return labels[address.toLowerCase()];
}
