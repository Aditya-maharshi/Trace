/**
 * lib/traceAI/config.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Provider configuration loaded from environment variables.
 *
 * SECURITY INVARIANT:
 *   This module runs SERVER-SIDE ONLY. Never import from client bundles.
 *   Never add a 'use client' directive here.
 *   API keys must NEVER appear in:
 *     - client source
 *     - query strings
 *     - browser logs
 *     - git history
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { TraceAITask } from "./types";

export interface ProviderConfig {
  id: string;
  model: string;
  enabled: boolean;
  timeoutMs: number;
  maxRetries: number;
  /** Tasks this provider is eligible for */
  tasks: TraceAITask[];
  /** Circuit-breaker: consecutive failures before marking degraded */
  circuitBreakerThreshold: number;
  /** How long to wait (ms) before probing a degraded provider */
  circuitBreakerResetMs: number;
}

export interface TraceAIConfig {
  providers: ProviderConfig[];
  defaultTask: TraceAITask;
  maxTotalBudgetMs: number;
  /** Maximum tool calls per Trace AI request */
  maxToolCallsPerRequest: number;
  /** Maximum agent steps per run */
  maxAgentSteps: number;
  enablePromptInjectionDefense: boolean;
}

function requireServerSide(): void {
  if (typeof window !== "undefined") {
    throw new Error(
      "[TraceAI Config] Attempted to load server-side config in a browser context. " +
      "This module must only be imported from server-side code."
    );
  }
}

export function loadTraceAIConfig(): TraceAIConfig {
  requireServerSide();

  const geminiEnabled = !!process.env.GEMINI_API_KEY;
  const groqEnabled = !!process.env.GROQ_API_KEY;

  if (!geminiEnabled && !groqEnabled) {
    console.warn(
      "[TraceAI Config] WARNING: No AI provider API keys configured. " +
      "Set GEMINI_API_KEY or GROQ_API_KEY in environment variables. " +
      "Trace AI will return status=unavailable until a provider is configured."
    );
  }

  const allTasks: TraceAITask[] = [
    "narrative",
    "follow_up",
    "evidence_explanation",
    "investigation",
    "agent_step_narration",
    "artifact_narrative",
    "followup_generation",
  ];

  const fastTasks: TraceAITask[] = [
    "narrative",
    "follow_up",
    "evidence_explanation",
    "agent_step_narration",
    "followup_generation",
  ];

  const providers: ProviderConfig[] = [
    {
      id: "gemini",
      // Allow override via env var for testing with different Gemini models
      model: process.env.GEMINI_MODEL ?? "gemini-1.5-flash",
      enabled: geminiEnabled,
      timeoutMs: parseInt(process.env.GEMINI_TIMEOUT_MS ?? "12000", 10),
      maxRetries: 2,
      tasks: allTasks,
      circuitBreakerThreshold: parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD ?? "3", 10),
      circuitBreakerResetMs: parseInt(process.env.CIRCUIT_BREAKER_RESET_MS ?? "60000", 10),
    },
    {
      id: "groq",
      // Override via GROQ_MODEL env var if needed.
      model: process.env.GROQ_MODEL ?? "openai/gpt-oss-120b",
      enabled: groqEnabled,
      timeoutMs: parseInt(process.env.GROQ_TIMEOUT_MS ?? "8000", 10),
      maxRetries: 2,
      tasks: fastTasks,
      circuitBreakerThreshold: parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD ?? "3", 10),
      circuitBreakerResetMs: parseInt(process.env.CIRCUIT_BREAKER_RESET_MS ?? "60000", 10),
    },
  ];

  return {
    providers: providers.filter((p) => p.enabled),
    defaultTask: "narrative",
    // Total budget for a single Trace AI request (across retries + fallbacks)
    maxTotalBudgetMs: parseInt(process.env.TRACE_AI_MAX_BUDGET_MS ?? "30000", 10),
    maxToolCallsPerRequest: parseInt(process.env.TRACE_AI_MAX_TOOL_CALLS ?? "5", 10),
    maxAgentSteps: parseInt(process.env.TRACE_AI_MAX_AGENT_STEPS ?? "10", 10),
    enablePromptInjectionDefense: process.env.TRACE_AI_PROMPT_INJECTION_DEFENSE !== "false",
  };
}

// ─── Routing Policy ───────────────────────────────────────────────────────────

/**
 * Task → preferred provider ordering.
 * Router picks the first available+healthy provider in this list.
 */
export const TASK_ROUTING_POLICY: Record<TraceAITask, string[]> = {
  // Fast/cheap tasks: Groq first (faster), Gemini as fallback
  narrative: ["groq", "gemini"],
  follow_up: ["groq", "gemini"],
  agent_step_narration: ["groq", "gemini"],
  followup_generation: ["groq", "gemini"],
  score_explanation: ["groq", "gemini"],
  glossary_definition: ["groq", "gemini"],

  // Evidence explanation: either is fine, Gemini slightly preferred for quality
  evidence_explanation: ["gemini", "groq"],

  // Investigation/agent steps: Gemini preferred (better reasoning + tool use)
  investigation: ["gemini", "groq"],

  // Artifact narrative: Gemini preferred for quality; constrained output
  artifact_narrative: ["gemini", "groq"],
};
