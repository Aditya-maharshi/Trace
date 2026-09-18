/**
 * lib/traceAI/agent/types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Agent-specific types. Re-exports shared types for agent consumers.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type {
  AgentStep,
  AgentStepStatus,
  AgentRunState,
  AgentTerminationReason,
  AgentPendingAction,
} from "../types";

/** Agent configuration passed at run start */
export interface AgentRunConfig {
  walletAddress: string;
  attributionResultId?: string;
  caseId?: string;
  startedBy?: string;
  maxSteps?: number;
  budgetUsd?: number;
  /** Custom tool sequence; defaults to standard investigation plan */
  toolPlan?: string[];
  orgId?: string;
  userId?: string;
}

/** Standard investigation plan — spec §57 */
export const DEFAULT_TOOL_PLAN: string[] = [
  "check_sanctions_status",
  "get_path_details",
  "resolve_ens",
  // Future: "check_mixer_exposure", "inspect_bridge_exit"
];

/** Events emitted by the agent during execution for streaming progress */
export type AgentProgressEvent =
  | { type: "step_started"; stepIndex: number; toolName?: string }
  | { type: "step_completed"; stepIndex: number; status: string; citationCount: number }
  | { type: "step_failed"; stepIndex: number; errorCode: string; userMessage: string }
  | { type: "approval_required"; actionId: string; toolName: string; reason: string }
  | { type: "completed"; terminationReason: string; totalSteps: number }
  | { type: "cancelled"; reason: string };
