/**
 * lib/traceAI/replay/buildTimeline.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure transform: converts a completed AgentRunState into an ordered array of
 * TimelineEvent objects suitable for the shareable Investigation Timeline UI.
 *
 * INVARIANT: This function reads only. It never writes to the AgentRunState.
 * INVARIANT: Failed/internal steps can be filtered out for the public view.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { AgentRunState, AgentStep, Citation } from "../types";

// ─── Timeline Types ───────────────────────────────────────────────────────────

export type TimelineEventKind =
  | "tool_call"
  | "decision"
  | "finding"
  | "approval_gate"
  | "error";

export interface TimelineEvent {
  index: number;
  kind: TimelineEventKind;
  /** Human-readable label for the step */
  label: string;
  /** The AI-generated narrative for this step */
  narrative: string;
  /** Tool called (if kind === "tool_call") */
  toolName?: string;
  /** Status colouring hint for the UI */
  status: "success" | "failed" | "skipped" | "pending";
  /** ISO timestamp when the step started */
  startedAt: string;
  /** ISO timestamp when the step completed (if available) */
  completedAt?: string;
  /** Duration in milliseconds */
  durationMs?: number;
  /** Evidence citations attached to this step */
  citations: Citation[];
}

export interface InvestigationTimeline {
  runId: string;
  walletAddress: string;
  startedAt: string;
  completedAt?: string;
  terminationReason?: string;
  /** Overall summary finding from the run */
  summary?: string;
  events: TimelineEvent[];
  /** Total number of steps (including filtered ones) */
  totalSteps: number;
  /** Steps visible in the public timeline */
  visibleSteps: number;
}

// ─── Step Type → Kind Mapping ─────────────────────────────────────────────────

function stepKind(step: AgentStep): TimelineEventKind {
  switch (step.type) {
    case "tool":     return "tool_call";
    case "decision": return "decision";
    case "narrative":return "finding";
    case "approval": return "approval_gate";
    case "fallback": return step.status === "failed" ? "error" : "tool_call";
    default:         return "tool_call";
  }
}

function stepLabel(step: AgentStep): string {
  switch (step.type) {
    case "tool":
      return step.toolName ? `Tool: ${step.toolName}` : "Tool Call";
    case "decision":
      return "Agent Decision";
    case "narrative":
      return "Finding";
    case "approval":
      return "Approval Gate";
    case "fallback":
      return step.toolName ? `Fallback: ${step.toolName}` : "Fallback Attempt";
    default:
      return "Step";
  }
}

function stepStatus(step: AgentStep): TimelineEvent["status"] {
  switch (step.status) {
    case "success": return "success";
    case "failed":  return "failed";
    case "skipped": return "skipped";
    default:        return "pending";
  }
}

// ─── Main Transform ───────────────────────────────────────────────────────────

export interface BuildTimelineOptions {
  /** If true, skip steps with status "failed" or "skipped" (for stakeholder view) */
  publicView?: boolean;
  /** Max steps to include */
  maxSteps?: number;
}

export function buildTimeline(
  run: AgentRunState,
  options: BuildTimelineOptions = {}
): InvestigationTimeline {
  const { publicView = false, maxSteps = 50 } = options;

  const allSteps = run.steps ?? [];

  // Filter for public view — hide internal failures and skipped retries
  const filtered = publicView
    ? allSteps.filter(
        (s) =>
          s.status !== "skipped" &&
          !(s.status === "failed" && s.type === "fallback")
      )
    : allSteps;

  const sliced = filtered.slice(0, maxSteps);

  const events: TimelineEvent[] = sliced.map((step, i) => {
    const startMs = new Date(step.startedAt).getTime();
    const endMs = step.completedAt ? new Date(step.completedAt).getTime() : null;

    return {
      index: i,
      kind: stepKind(step),
      label: stepLabel(step),
      narrative: step.narrative ?? "",
      toolName: step.toolName,
      status: stepStatus(step),
      startedAt: step.startedAt,
      completedAt: step.completedAt,
      durationMs: endMs !== null ? endMs - startMs : undefined,
      citations: step.citations ?? [],
    };
  });

  return {
    runId: run.runId,
    walletAddress: run.walletAddress,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    terminationReason: run.terminationReason,
    summary: run.findings,
    events,
    totalSteps: allSteps.length,
    visibleSteps: events.length,
  };
}
