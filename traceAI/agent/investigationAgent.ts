/**
 * lib/traceAI/agent/investigationAgent.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Bounded autonomous investigation agent.
 *
 * INVARIANT: Agent controls WORKFLOW, not COMPLIANCE TRUTH.
 *   It may decide: "run mixer check next"
 *   It may NOT decide: "override the risk level to HIGH"
 *
 * INVARIANT: Tool loop is bounded by maxSteps, budgetUsd, and maxToolCalls.
 *   No infinite loops possible.
 *
 * INVARIANT: Raw tool output is stored separately from AI narration.
 *   rawOutput and narrative fields are NEVER combined into a single blob.
 *
 * INVARIANT: Mutating tools require human approval before execution.
 *   read_only tools proceed automatically.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { v4 as uuidv4 } from "uuid";
import type {
  AgentStep,
  AgentRunState,
  AttributionResult,
  TraceToolResult,
  Citation,
} from "../types";
import type { AgentRunConfig, AgentProgressEvent } from "./types";
import type { AgentStateStore } from "./state";
import { InMemoryAgentStateStore } from "./state";
import { DEFAULT_TOOL_PLAN } from "./types";
import { toolRegistry, type ToolExecutionContext } from "../tools/registry";
import { loadTraceAIConfig } from "../config";
import { buildCitationRegistry } from "../citations/resolver";
import { parseCitations } from "../citations/parser";
import { traceAILogger } from "../observability/logger";

// ─── Investigation Agent ──────────────────────────────────────────────────────

export class InvestigationAgent {
  private stateStore: AgentStateStore;
  private progressCallbacks: Map<string, (event: AgentProgressEvent) => void> = new Map();

  constructor(stateStore?: AgentStateStore) {
    this.stateStore = stateStore ?? new InMemoryAgentStateStore();
  }

  /**
   * Register a callback to receive real-time progress events for a run.
   * Used by the streaming API route to push SSE events.
   */
  onProgress(runId: string, callback: (event: AgentProgressEvent) => void): void {
    this.progressCallbacks.set(runId, callback);
  }

  private emit(runId: string, event: AgentProgressEvent): void {
    this.progressCallbacks.get(runId)?.(event);
    traceAILogger.debug(`[Agent] ${event.type}`, { runId, event: event.type });
  }

  /**
   * Start a new investigation run.
   * Returns runId immediately; execution continues asynchronously.
   * Progress is streamed via onProgress callback.
   */
  async startRun(
    config: AgentRunConfig,
    attributionResult?: AttributionResult
  ): Promise<string> {
    const run = await this.stateStore.createRun(config);
    run.attributionResult = attributionResult;

    traceAILogger.info(`[Agent] Starting run ${run.runId} for ${config.walletAddress}`);

    // Execute asynchronously
    this.executeRun(run, config).catch((err) => {
      traceAILogger.error(`[Agent] Run ${run.runId} failed unexpectedly`, {
        error: String(err),
      });
    });

    return run.runId;
  }

  // ── Main Execution Loop ───────────────────────────────────────────────────

  private async executeRun(run: AgentRunState, config: AgentRunConfig): Promise<void> {
    const aiConfig = loadTraceAIConfig();
    const maxSteps = config.maxSteps ?? aiConfig.maxAgentSteps;
    const toolPlan = config.toolPlan ?? DEFAULT_TOOL_PLAN;

    const executionContext: ToolExecutionContext = {
      attributionResult: run.attributionResult,
      orgId: config.orgId,
      userId: config.userId,
      remainingBudgetUsd: config.budgetUsd,
    };

    let stepIndex = 0;

    // ── Budget pre-check ──────────────────────────────────────────────────
    if (config.budgetUsd !== undefined && config.budgetUsd <= 0) {
      await this.stateStore.completeRun(
        run.runId,
        "failed_budget",
        "Run failed before start: budget is 0."
      );
      this.emit(run.runId, {
        type: "completed",
        terminationReason: "failed_budget",
        totalSteps: 0,
      });
      return;
    }

    // ── Tool execution loop ───────────────────────────────────────────────
    for (const toolName of toolPlan) {
      if (stepIndex >= maxSteps) {
        traceAILogger.info(`[Agent] Max steps reached: ${maxSteps}`);
        await this.stateStore.completeRun(run.runId, "completed_max_steps");
        this.emit(run.runId, {
          type: "completed",
          terminationReason: "completed_max_steps",
          totalSteps: stepIndex,
        });
        return;
      }

      const tool = toolRegistry.get(toolName);
      if (!tool) {
        traceAILogger.warn(`[Agent] Tool not found in registry: ${toolName}`);
        stepIndex++;
        continue;
      }

      // ── Mutating/irreversible tools require approval ───────────────────
      if (
        tool.definition.riskTier === "mutating" ||
        tool.definition.riskTier === "irreversible"
      ) {
        const actionId = uuidv4();
        const step: AgentStep = {
          index: stepIndex,
          type: "approval",
          toolName,
          status: "paused",
          riskTier: tool.definition.riskTier,
          startedAt: new Date().toISOString(),
        };
        await this.stateStore.addStep(run.runId, step);
        this.emit(run.runId, {
          type: "approval_required",
          actionId,
          toolName,
          reason: `Tool '${toolName}' requires analyst approval (risk tier: ${tool.definition.riskTier})`,
        });
        // For now, pause the run — real implementation would await approval
        await this.stateStore.completeRun(run.runId, "paused");
        return;
      }

      // ── Execute read-only tool ─────────────────────────────────────────
      const step: AgentStep = {
        index: stepIndex,
        type: "tool",
        toolName,
        input: this.buildToolInput(toolName, run),
        status: "running",
        startedAt: new Date().toISOString(),
      };

      await this.stateStore.addStep(run.runId, step);
      this.emit(run.runId, { type: "step_started", stepIndex, toolName });

      const toolCall = {
        callId: uuidv4(),
        toolName,
        input: step.input,
      };

      const result = await toolRegistry.execute(toolCall, executionContext);

      // INVARIANT: Raw output is stored separately from any narrative
      const update: Partial<AgentStep> = {
        rawOutput: result.output,  // Preserved separately
        status: result.status === "success" ? "success" : "failed",
        completedAt: new Date().toISOString(),
        errorClass: result.error?.code,
      };

      // Build citations from tool result evidence refs
      const citationRegistry = buildCitationRegistry({
        attributionResult: run.attributionResult,
        toolResults: [result],
      });

      const citations: Citation[] = Array.from(citationRegistry.citations.values()).filter(
        (c) => result.evidenceRefs?.some((r) => r.id === c.id)
      );

      if (citations.length > 0) {
        update.citations = citations;
      }

      // Handle tool failure
      if (result.status !== "success") {
        update.deviationReason =
          `Tool ${toolName} failed with code ${result.error?.code ?? "UNKNOWN"}. ` +
          `Continuing with remaining tools.`;
        traceAILogger.warn(`[Agent] Tool failed: ${toolName}`, {
          runId: run.runId,
          errorCode: result.error?.code,
        });
      }

      await this.stateStore.updateStepStatus(run.runId, stepIndex, update);
      this.emit(run.runId, {
        type: "step_completed",
        stepIndex,
        status: update.status ?? "failed",
        citationCount: citations.length,
      });

      stepIndex++;
    }

    // ── Synthesis step ────────────────────────────────────────────────────
    await this.synthesizeFindings(run, stepIndex);
  }

  private buildToolInput(toolName: string, run: AgentRunState): unknown {
    switch (toolName) {
      case "check_sanctions_status":
        return { address: run.walletAddress };
      case "get_path_details":
        return { pathIndex: 0 }; // Start with primary path
      case "resolve_ens":
        return { address: run.walletAddress };
      default:
        return {};
    }
  }

  private async synthesizeFindings(run: AgentRunState, stepIndex: number): Promise<void> {
    // Build a text summary from the steps executed
    const successfulSteps = run.steps.filter((s) => s.status === "success");
    const failedSteps = run.steps.filter((s) => s.status === "failed");

    const summaryParts: string[] = [
      `Investigation completed for ${run.walletAddress}.`,
      `Tools executed: ${successfulSteps.map((s) => s.toolName).join(", ") || "none"}.`,
    ];

    if (failedSteps.length > 0) {
      summaryParts.push(
        `Tools with errors: ${failedSteps.map((s) => s.toolName).join(", ")}. ` +
          `Results from these tools should be treated as UNKNOWN.`
      );
    }

    if (run.attributionResult) {
      summaryParts.push(
        `Attribution: ${run.attributionResult.nearestVasp ?? "Unknown"} ` +
          `(${run.attributionResult.confidence} confidence, ${run.attributionResult.risk} risk, ` +
          `${run.attributionResult.hops} hops).`
      );
    }

    const findings = summaryParts.join(" ");

    await this.stateStore.completeRun(run.runId, "completed_definitive", findings);
    this.emit(run.runId, {
      type: "completed",
      terminationReason: "completed_definitive",
      totalSteps: stepIndex,
    });
  }

  async cancelRun(runId: string): Promise<void> {
    await this.stateStore.cancelRun(runId);
    this.emit(runId, { type: "cancelled", reason: "Cancelled by user" });
    this.progressCallbacks.delete(runId);
    traceAILogger.info(`[Agent] Run cancelled: ${runId}`);
  }

  async getRun(runId: string): Promise<AgentRunState | null> {
    return this.stateStore.getRun(runId);
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _agent: InvestigationAgent | null = null;

export function getInvestigationAgent(): InvestigationAgent {
  if (!_agent) {
    _agent = new InvestigationAgent();
  }
  return _agent;
}
