export interface ScoreBreakdown {
  hops: number;
  totalValueUSD: number;
  daysSinceLastTx: number;
  recencyFactor: number;
  hopFactor: number;
  valueFactor: number;
  score: number;
}

export interface ScoredAttribution {
  vasp: string;
  hops: number;
  path: string[];
  score: number;
  assetsInvolved: string[];
  structuringFlaggedHops?: number[];
  breakdown?: ScoreBreakdown;
}

export interface SanctionsFlag {
  address: string;
  sanctioned: boolean;
}

export interface BridgeExitPoint {
  address: string;
  label: string;
  hopIndex: number;
  pathIndex: number;
}

export interface MethodologyDisclosure {
  notice: string;
  vaspRegistryNotice: string;
  sanctionsSource: string;
  humanReviewDisclaimer: string;
  calibrationDate: string;
  calibrationSample: string;
  calibratedHighThreshold: number;
  calibratedLowThreshold: number;
  activeHighThreshold: number;
  activeLowThreshold: number;
  limitationsDocument: string;
}

export interface TopVaspEntry {
  vasp: string;
  vaspLabel: string | null;
  bestHops: number;
  confidence: "High" | "Medium" | "Low";
  combinedScore: number;
  risk: "HIGH" | "LOW";
}

export interface AttributionResponse {
  wallet: string;
  nearestVasp: string | null;
  nearestVaspLabel: string | null;
  hops: number | null;
  confidence: "High" | "Medium" | "Low" | null;
  score: number | null;
  paths: ScoredAttribution[];
  risk: "HIGH" | "LOW";
  structuringSignalDetected: boolean;
  sanctionsDetail?: SanctionsFlag[];
  ensNames: Record<string, string>;
  mixerExposure: Array<{ address: string; label: string; hopIndex: number }>;
  confidenceThresholds: { high: number; medium: number };
  topVasps: TopVaspEntry[];
  bridgeExitPoints: BridgeExitPoint[];
  traceExitedToBridge: boolean;
  incompleteTraversal: { skippedNodes: number; timeoutReached?: boolean };
  methodology: MethodologyDisclosure;
  dataProvenance: {
    source: "live-etherscan" | "live-blockscout" | "fixture-cache";
    fetchedAt: string;
  };
  dataSource: string;
  graph?: {
    nodes: Array<{ id: string; type: "wallet" | "vasp" | "mixer" | "bridge" | "sanctioned"; label?: string }>;
    edges: Array<{ source: string; target: string; hopIndex: number; valueUSD: number; asset: string; timestamp: string }>;
    truncated: boolean;
  };
}

export interface NarrateResponse {
  narrative: string;
}

export interface ChatResponse {
  answer: string;
}
