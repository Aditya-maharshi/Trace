/**
 * lib/traceAI/agent/state.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Agent run state management.
 *
 * Provides an in-memory implementation for development/standalone use.
 * For production: replace InMemoryAgentStateStore with a Supabase-backed store.
 *
 * INTEGRATION NOTE:
 *   The AgentStateStore interface is what the investigationAgent.ts depends on.
 *   Implement SupabaseAgentStateStore and inject it for production use.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { v4 as uuidv4 } from "uuid";
import type { AgentRunState, AgentStep, AgentTerminationReason } from "../types";
import type { AgentRunConfig } from "./types";

// ─── Store Interface ──────────────────────────────────────────────────────────

export interface AgentStateStore {
  createRun(config: AgentRunConfig): Promise<AgentRunState>;
  getRun(runId: string): Promise<AgentRunState | null>;
  addStep(runId: string, step: AgentStep): Promise<void>;
  updateStepStatus(runId: string, stepIndex: number, update: Partial<AgentStep>): Promise<void>;
  completeRun(
    runId: string,
    terminationReason: AgentTerminationReason,
    findings?: string
  ): Promise<void>;
  cancelRun(runId: string): Promise<void>;
}

// ─── In-Memory Store (development/standalone) ─────────────────────────────────

export class InMemoryAgentStateStore implements AgentStateStore {
  private runs = new Map<string, AgentRunState>();

  async createRun(config: AgentRunConfig): Promise<AgentRunState> {
    const run: AgentRunState = {
      runId: uuidv4(),
      caseId: config.caseId,
      walletAddress: config.walletAddress,
      status: "running",
      steps: [],
      budgetUsd: config.budgetUsd,
      spentUsd: 0,
      maxSteps: config.maxSteps ?? 10,
      startedBy: config.startedBy,
      startedAt: new Date().toISOString(),
    };
    this.runs.set(run.runId, run);
    return run;
  }

  async getRun(runId: string): Promise<AgentRunState | null> {
    return this.runs.get(runId) ?? null;
  }

  async addStep(runId: string, step: AgentStep): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`Run ${runId} not found`);
    run.steps.push(step);
  }

  async updateStepStatus(
    runId: string,
    stepIndex: number,
    update: Partial<AgentStep>
  ): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`Run ${runId} not found`);
    const step = run.steps[stepIndex];
    if (!step) throw new Error(`Step ${stepIndex} not found in run ${runId}`);
    Object.assign(step, update);
  }

  async completeRun(
    runId: string,
    terminationReason: AgentTerminationReason,
    findings?: string
  ): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) return;
    run.status = terminationReason.startsWith("failed") ? "failed" : "completed";
    run.terminationReason = terminationReason;
    run.completedAt = new Date().toISOString();
    run.findings = findings;
  }

  async cancelRun(runId: string): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) return;
    run.status = "cancelled";
    run.terminationReason = "cancelled";
    run.completedAt = new Date().toISOString();
  }
}

// ─── Supabase Store Stub ──────────────────────────────────────────────────────
// INTEGRATION: Implement this for production. Schema:
//
// Table: agent_runs
//   run_id uuid PRIMARY KEY DEFAULT gen_random_uuid()
//   org_id uuid NOT NULL REFERENCES organizations(id)
//   case_id uuid REFERENCES cases(id)
//   wallet_address text NOT NULL
//   status text NOT NULL DEFAULT 'running'
//   steps jsonb NOT NULL DEFAULT '[]'
//   budget_usd numeric
//   spent_usd numeric NOT NULL DEFAULT 0
//   max_steps integer NOT NULL DEFAULT 10
//   started_by uuid REFERENCES users(id)
//   started_at timestamptz NOT NULL DEFAULT now()
//   completed_at timestamptz
//   termination_reason text
//   findings text
//   -- RLS: user must belong to org_id

export class SupabaseAgentStateStore implements AgentStateStore {
  constructor(
    private readonly supabaseClient: unknown,
    private readonly orgId: string
  ) {}

  async createRun(config: AgentRunConfig): Promise<AgentRunState> {
    throw new Error(
      "[STUB] SupabaseAgentStateStore.createRun not yet implemented. " +
        "Integrate with your Supabase client and agent_runs table."
    );
  }

  async getRun(runId: string): Promise<AgentRunState | null> {
    throw new Error("[STUB] SupabaseAgentStateStore.getRun not yet implemented.");
  }

  async addStep(runId: string, step: AgentStep): Promise<void> {
    throw new Error("[STUB] SupabaseAgentStateStore.addStep not yet implemented.");
  }

  async updateStepStatus(runId: string, stepIndex: number, update: Partial<AgentStep>): Promise<void> {
    throw new Error("[STUB] SupabaseAgentStateStore.updateStepStatus not yet implemented.");
  }

  async completeRun(runId: string, terminationReason: AgentTerminationReason, findings?: string): Promise<void> {
    throw new Error("[STUB] SupabaseAgentStateStore.completeRun not yet implemented.");
  }

  async cancelRun(runId: string): Promise<void> {
    throw new Error("[STUB] SupabaseAgentStateStore.cancelRun not yet implemented.");
  }
}
