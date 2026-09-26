// ─────────────────────────────────────────────────────────────────────────────
// Chain types (Phase 1 additions)
// ─────────────────────────────────────────────────────────────────────────────

export type SupportedChain =
  | "ethereum"
  | "bitcoin"
  | "tron"
  | "bnbchain"
  | "solana"
  | "polygon";

export interface TraceParams {
  maxHops: number;
  maxBranchesPerHop: number;
  chain: SupportedChain;
  startedAt: string;
}

/**
 * Represents a point in a trace where funds crossed chains via a bridge.
 */
export interface CrossChainHop {
  fromChain: SupportedChain;
  toChain: SupportedChain;
  bridgeAddress: string;
  bridgeLabel: string;
  exitTxHash: string;
  pathIndex: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Risk typology types (Phase 6 additions)
// ─────────────────────────────────────────────────────────────────────────────

export type RiskTypologyName =
  | "peeling_chain"
  | "smurfing"
  | "mixer_proximity"
  | "sanctioned_proximity"
  | "ransomware_pattern";

export interface RiskTypology {
  /** Named typology, tied to a real-world FATF/FinCEN pattern. */
  name: RiskTypologyName;
  /** Human-readable description of why this flag was triggered. */
  description: string;
  /** Severity level. */
  severity: "HIGH" | "MEDIUM" | "LOW";
  /** Supporting evidence from the trace (addresses / hop indices). */
  evidence: string[];
}

export interface ScoreBreakdown {
  hops: number;
  totalValueUSD: number;
  daysSinceLastTx: number;
  taintFraction: number; // Volume-weighted percentage
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
  risk: "HIGH" | "LOW" | "UNKNOWN";
}

export type VaspClassification = 'onshore_registered' | 'offshore_registered' | 'offshore_non_compliant' | 'unknown';
export type LegalInstrument = 'SAHYOG' | 'MLAT' | 'BLOCKING_ORDER' | 'NONE';

export interface VaspClassificationDetails {
  classification: VaspClassification;
  sourceReference: string;
  lastSyncedAt: string;
  availableInstruments: LegalInstrument[];
}

export interface AttributionResponse {
  wallet: string;
  nearestVasp: string | null;
  nearestVaspLabel: string | null;
  hops: number | null;
  confidence: "High" | "Medium" | "Low" | null;
  score: number | null;
  paths: ScoredAttribution[];
  risk: "HIGH" | "LOW" | "UNKNOWN";
  structuringSignalDetected: boolean;
  sanctionsDetail?: SanctionsFlag[];
  /** True when the sanctions screening API was unavailable — risk may be understated. */
  sanctionsCheckUnavailable?: boolean;
  ensNames: Record<string, string>;
  mixerExposure: Array<{ address: string; label: string; hopIndex: number }>;
  confidenceThresholds: { high: number; medium: number };
  topVasps: TopVaspEntry[];
  bridgeExitPoints: BridgeExitPoint[];
  traceExitedToBridge: boolean;
  vaspClassification?: VaspClassificationDetails;
  /** Server-issued id for this trace. Reports must be generated from this id, not client JSON. */
  requestId?: string;
  incompleteTraversal: {
    skippedNodes: number;
    timeoutReached?: boolean;
    /** True when at least one address returned a full page of txs (more history exists). */
    historyTruncated?: boolean;
    historyTruncatedAddresses?: string[];
  };
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
  // ── Phase 1 additions — chain-aware tracing — all optional for backwards compat —
  /** The chain this trace was performed on. Defaults to "ethereum" for pre-Phase-1 results. */
  chain?: SupportedChain;
  /** Parameters used for this trace run (for auditability). */
  traceParams?: TraceParams;
  /** ISO 8601 timestamp of when the trace result was generated. */
  generatedAt?: string;
  /** Cross-chain bridge/swap hops detected during traversal (Phase 2). */
  crossChainHops?: CrossChainHop[];
  // ── Phase 6 additions — risk typologies —
  /** Risk typologies detected in this trace. Empty array if none detected. */
  riskTypologies?: RiskTypology[];
}

export interface NarrateResponse {
  narrative: string;
}

export interface ChatResponse {
  answer: string;
}

export * from './caseStateMachine';

export interface Case {
  id: string;
  user_id: string | null;
  org_id: string;
  title: string;
  description: string | null;
  status: import('./caseStateMachine').CaseStatus;
  version: number;
  analyst_id: string | null;
  wallets: string[];
  jurisdiction: string | null;
  risk_score: number | null;
  entered_current_state_at: string;
  sla_status: import('./caseStateMachine').SlaStatus;
  reason_for_transition: string | null;
  created_at: string;
  updated_at: string;
  // Computed fields
  sla_threshold_hours?: number;
  time_in_state_hours?: number;
  is_sla_breaching?: boolean;
}

export interface CaseHistoryEntry {
  id: string;
  case_id: string;
  from_state: import('./caseStateMachine').CaseStatus | null;
  to_state: import('./caseStateMachine').CaseStatus;
  actor_id: string | null;
  actor_type: 'human' | 'system' | 'api';
  reason: string;
  metadata: Record<string, any>;
  created_at: string;
}

export interface CaseWallet {
  id: string;
  case_id: string;
  address: string;
  added_by: string | null;
  added_at: string;
  notes: string | null;
}

export interface CaseEvidence {
  id: string;
  case_id: string;
  evidence_type: 'graph_node' | 'graph_edge' | 'subgraph_slice' | 'lookup_snapshot' | 'note';
  lookup_id: string | null;
  graph_payload_hash: string;
  subgraph_slice: any;
  pinned_by: string | null;
  pinned_at: string;
  annotation: string | null;
}

export interface SlaPolicy {
  id: string;
  org_id: string;
  state: import('./caseStateMachine').CaseStatus;
  threshold_hours: number;
  created_at: string;
}
