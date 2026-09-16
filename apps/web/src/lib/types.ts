export type ConfidenceLevel = "High" | "Medium" | "Low";
export type RiskLevel = "LOW" | "HIGH" | "UNKNOWN";

export interface PathHop {
  address: string;
  ensName?: string;
  valueEth: number;
  /** ISO timestamp */
  timestamp: string;
  label?: string;
}

export interface PathResult {
  hops: PathHop[];
  score: number;
}

export interface AttributionResult {
  address: string;
  vasp: string;
  hopCount: number;
  confidence: ConfidenceLevel;
  risk: RiskLevel;
  structuringFlag?: boolean;
  summary: string;
  paths: PathResult[];
}

export const ETH_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export function truncateAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
