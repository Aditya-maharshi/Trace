/**
 * scripts/refreshVaspLabels.ts
 *
 * Automated refresh script for known Virtual Asset Service Provider (VASP)
 * exchange labels on Ethereum mainnet.
 *
 * Dataset Source:
 *   brianleect/etherscan-labels (MIT License)
 *   https://github.com/brianleect/etherscan-labels
 *
 * Usage:
 *   npm run refresh:vasp
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATASET_URL =
  "https://raw.githubusercontent.com/brianleect/etherscan-labels/main/data/etherscan/combined/combinedAccountLabels.json";

const DATA_FILE_PATH = path.resolve(__dirname, "../data/vasp_labels.json");

// Curated baseline addresses to guarantee minimum coverage even if upstream drops them
const BASELINE_LABELS: Record<string, string> = {
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

// Targeted CEX keyword regex matching names of centralized exchanges
const CEX_NAME_REGEX =
  /^(binance|coinbase|kraken|bitfinex|okx|kucoin|huobi|gate\.io|bybit|gemini|crypto\.com|bithumb|upbit|poloniex|mexc|deribit|bitstamp|bittrex|wazirx)(\b|[\s\d:_-]|$)/i;

// Exclude decentralized exchange pools, proxies, and liquidity routers
const DEX_EXCLUDE_REGEX =
  /dex|uniswap|sushiswap|balancer|curve|1inch|pancakeswap|proxy|router|pair|pool|airswap|kyber|bancor/i;

interface EtherscanLabelEntry {
  name?: string;
  labels?: string[];
}

export interface VaspDatasetFile {
  _metadata: {
    source: string;
    license: string;
    lastRefreshed: string;
    totalCount: number;
    description: string;
  };
  labels: Record<string, string>;
}

export async function refreshVaspLabels(): Promise<{
  added: number;
  removed: number;
  relabeled: number;
  unchanged: number;
  total: number;
}> {
  console.log(`[refreshVaspLabels] Fetching open-source labels from: ${DATASET_URL}`);
  const response = await fetch(DATASET_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch dataset: ${response.status} ${response.statusText}`);
  }

  const rawData = (await response.json()) as Record<string, EtherscanLabelEntry>;
  console.log(`[refreshVaspLabels] Successfully downloaded ${Object.keys(rawData).length} total labeled accounts.`);

  // Filter for CEX addresses
  const newLabels: Record<string, string> = { ...BASELINE_LABELS };

  for (const [address, entry] of Object.entries(rawData)) {
    if (!address.startsWith("0x") || address.length !== 42) continue;
    if (!entry || typeof entry.name !== "string" || !entry.name.trim()) continue;

    const name = entry.name.trim();
    if (DEX_EXCLUDE_REGEX.test(name)) continue;

    if (Array.isArray(entry.labels) && entry.labels.some((l) => DEX_EXCLUDE_REGEX.test(l))) {
      continue;
    }

    if (CEX_NAME_REGEX.test(name)) {
      newLabels[address.toLowerCase()] = name;
    }
  }

  // Load existing labels file if present to compute delta
  let existingLabels: Record<string, string> = {};
  if (fs.existsSync(DATA_FILE_PATH)) {
    try {
      const existingContent = fs.readFileSync(DATA_FILE_PATH, "utf-8");
      const parsed = JSON.parse(existingContent) as VaspDatasetFile;
      if (parsed && typeof parsed.labels === "object") {
        existingLabels = parsed.labels;
      }
    } catch {
      // ignore parse errors and proceed
    }
  }

  // Calculate statistics
  let added = 0;
  let relabeled = 0;
  let unchanged = 0;
  let removed = 0;

  for (const [addr, label] of Object.entries(newLabels)) {
    if (!(addr in existingLabels)) {
      added++;
    } else if (existingLabels[addr] !== label) {
      relabeled++;
    } else {
      unchanged++;
    }
  }

  for (const addr of Object.keys(existingLabels)) {
    if (!(addr in newLabels)) {
      removed++;
    }
  }

  // Build new file content
  const datasetFile: VaspDatasetFile = {
    _metadata: {
      source: "brianleect/etherscan-labels (combinedAccountLabels.json)",
      license: "MIT",
      lastRefreshed: new Date().toISOString(),
      totalCount: Object.keys(newLabels).length,
      description:
        "Verified Ethereum Mainnet Centralized Exchange (CEX) deposit & hot wallet registry filtered from open-source Etherscan labels.",
    },
    labels: newLabels,
  };

  // Ensure data directory exists
  const dataDir = path.dirname(DATA_FILE_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  fs.writeFileSync(DATA_FILE_PATH, JSON.stringify(datasetFile, null, 2), "utf-8");

  console.log("\n─── VASP Labels Refresh Report ───");
  console.log(`Total VASP Addresses : ${Object.keys(newLabels).length}`);
  console.log(`Newly Added          : +${added}`);
  console.log(`Relabeled / Renamed  : ~${relabeled}`);
  console.log(`Unchanged            : ${unchanged}`);
  console.log(`Removed              : -${removed}`);
  console.log(`Saved to             : ${DATA_FILE_PATH}`);
  console.log("──────────────────────────────────\n");

  return {
    added,
    removed,
    relabeled,
    unchanged,
    total: Object.keys(newLabels).length,
  };
}

// Run when directly executed
if (process.argv[1] && process.argv[1].endsWith("refreshVaspLabels.ts")) {
  refreshVaspLabels().catch((err) => {
    console.error("[refreshVaspLabels] Error:", err);
    process.exit(1);
  });
}
