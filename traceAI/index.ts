/**
 * lib/traceAI/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Public API for the Trace AI intelligence subsystem.
 *
 * APPLICATION ENTRY POINT:
 *   import { traceAI } from "lib/traceAI"
 *   const response = await traceAI.explain(attributionResult)
 *   const response = await traceAI.answer(question, context)
 *
 * INVARIANT: Consumers never import from:
 *   - lib/traceAI/providers/*
 *   - lib/traceAI/router.ts
 *   - lib/traceAI/citations/*
 *
 * They only use this public surface.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { v4 as uuidv4 } from "uuid";
import type {
  AttributionResult,
  TraceAIResponse,
  TraceAIStatus,
  TraceAITask,
  TraceAIWarning,
  EvidenceReference,
  EvidenceContext,
  ConversationMessage,
  FollowUpGenerationInput,
} from "./types";
import { getRouter, RouterError } from "./router";
import { buildSystemPrompt, detectCaveats, buildFollowUpGenerationPrompt } from "./policies";
import { buildRegistry, parseCitations } from "./citations/parser";
import { generateFollowUps } from "./followups/generator";
import { loadTraceAIConfig } from "./config";
import { traceAILogger } from "./observability/logger";

// ─── Trace AI Orchestrator ────────────────────────────────────────────────────

class TraceAI {
  /**
   * MODE A — Explain
   * Explain an already-computed attribution result.
   * This is the primary Trace AI feature replacing "AI Narrative".
   */
  async explain(
    attributionResult: AttributionResult,
    options?: {
      conversationHistory?: ConversationMessage[];
      requestId?: string;
    }
  ): Promise<TraceAIResponse> {
    return this.generateResponse({
      task: "narrative",
      attributionResult,
      userMessage: "Provide an evidence-grounded explanation of this attribution result.",
      conversationHistory: options?.conversationHistory,
      requestId: options?.requestId,
    });
  }

  /**
   * MODE B — Answer
   * Answer a natural-language question about the current investigation.
   */
  async answer(
    question: string,
    context: {
      attributionResult?: AttributionResult;
      conversationHistory?: ConversationMessage[];
      requestId?: string;
      audience?: "analyst" | "plain_english";
    }
  ): Promise<TraceAIResponse> {
    return this.generateResponse({
      task: "follow_up",
      attributionResult: context.attributionResult,
      userMessage: question,
      conversationHistory: context.conversationHistory,
      requestId: context.requestId,
      audience: context.audience,
    });
  }

  /**
   * MODE C — Artifact Generation
   * Generates a structured compliance report (narrative) for an attribution result.
   */
  async generateArtifact(
    attributionResult: AttributionResult,
    options?: {
      requestId?: string;
    }
  ): Promise<TraceAIResponse> {
    return this.generateResponse({
      task: "artifact_narrative",
      attributionResult,
      userMessage: "Generate a formal compliance artifact narrative for this trace result.",
      requestId: options?.requestId,
    });
  }

  /**
   * Generate follow-up questions for the current result.
   * Always returns at least 2 questions (deterministic fallback).
   */
  async generateFollowUpQuestions(
    attributionResult: AttributionResult,
    context?: {
      previousQuestion?: string;
      previousAnswer?: string;
    }
  ): Promise<string[]> {
    const input: FollowUpGenerationInput = {
      attributionResult,
      previousQuestion: context?.previousQuestion,
      previousAnswer: context?.previousAnswer,
    };

    // Try LLM-generated questions
    try {
      const router = getRouter();
      const systemPrompt = buildFollowUpGenerationPrompt(attributionResult);

      const result = await router.generate("followup_generation", {
        systemPrompt,
        userMessage: "Generate follow-up questions.",
        maxOutputTokens: 256,
      });

      // Parse JSON response
      const jsonMatch = result.response.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const output = generateFollowUps(input, parsed.questions);
        return output.questions;
      }
    } catch {
      // Fall through to deterministic fallback
    }

    return generateFollowUps(input).questions;
  }

  // ─── Internal: Response Generation ─────────────────────────────────────────

  private async generateResponse(params: {
    task: TraceAITask;
    attributionResult?: AttributionResult;
    userMessage: string;
    conversationHistory?: ConversationMessage[];
    requestId?: string;
    audience?: "analyst" | "plain_english";
  }): Promise<TraceAIResponse> {
    const requestId = params.requestId ?? uuidv4();
    const startedAt = Date.now();

    // ── Build citation registry from authoritative data ──────────────────
    const citationRegistry = buildRegistry({
      attributionResult: params.attributionResult,
    });

    // ── Build evidence context ───────────────────────────────────────────
    const caveats = params.attributionResult ? detectCaveats(params.attributionResult) : [];
    const evidenceContext: EvidenceContext = {
      attributionResult: params.attributionResult,
    };

    // ── Build system prompt ──────────────────────────────────────────────
    let systemPrompt = buildSystemPrompt(params.task, params.audience);
    if (caveats.length > 0) {
      systemPrompt += "\n\n## Critical Caveats for This Request\n" + caveats.map((c) => `- ${c}`).join("\n");
    }

    // ── Call router ──────────────────────────────────────────────────────
    try {
      const router = getRouter();
      const routerResult = await router.generate(params.task, {
        systemPrompt,
        userMessage: params.userMessage,
        evidenceContext,
        conversationHistory: params.conversationHistory,
        audience: params.audience,
      });

      // ── Parse citations ────────────────────────────────────────────────
      const parseResult = parseCitations(routerResult.response.text, citationRegistry);

      // ── Collect evidence references ───────────────────────────────────
      const evidenceUsed: EvidenceReference[] = parseResult.citations.map((c) => ({
        id: c.id,
        type: c.type,
        source: "trace_engine",
        locator: undefined,
        data: c as unknown as Record<string, unknown>,
      }));

      // ── Generate follow-ups ───────────────────────────────────────────
      let followUpQuestions: string[] = [];
      if (params.attributionResult) {
        try {
          followUpQuestions = generateFollowUps({
            attributionResult: params.attributionResult,
            previousQuestion:
              params.task === "follow_up" ? params.userMessage : undefined,
          }).questions;
        } catch {
          followUpQuestions = [];
        }
      }

      // ── Build warnings ────────────────────────────────────────────────
      const warnings: TraceAIWarning[] = [];
      if (parseResult.rejectedCount > 0) {
        warnings.push({
          code: "CITATIONS_REJECTED",
          severity: "info",
          message: `${parseResult.rejectedCount} citation markers were rejected as unresolvable.`,
        });
      }
      if (caveats.length > 0 && params.attributionResult?.sanctionsDetail?.status === "UNKNOWN") {
        warnings.push({
          code: "SANCTIONS_UNKNOWN",
          severity: "caution",
          message: "Sanctions status is UNKNOWN. The screening service was unavailable.",
          affectedCapability: "sanctions_screening",
        });
      }
      if (params.attributionResult?.traceExitedToBridge) {
        warnings.push({
          code: "BRIDGE_EXIT",
          severity: "info",
          message: "The trace ended at a bridge contract. Destination-chain attribution is not established.",
          affectedCapability: "cross_chain_tracing",
        });
      }

      // ── Log request event ─────────────────────────────────────────────
      traceAILogger.logRequestEvent({
        requestId,
        task: params.task,
        providerId: routerResult.providerId,
        modelId: routerResult.modelId,
        startedAt: new Date(startedAt).toISOString(),
        completedAt: new Date().toISOString(),
        latencyMs: Date.now() - startedAt,
        fallbackUsed: routerResult.fallbackUsed,
        fallbackReason: routerResult.fallbackReason,
        retryCount: routerResult.retryCount,
        timeoutMs: 12000,
        success: true,
        toolCallCount: 0,
        citationCount: parseResult.citations.length,
        question:
          params.task === "follow_up" ? params.userMessage : undefined,
      });

      const status: TraceAIStatus = routerResult.fallbackUsed ? "degraded" : "success";

      return {
        requestId,
        status,
        answer: parseResult.cleanText,
        citations: parseResult.citations,
        followUpQuestions,
        evidenceUsed,
        providerMeta: {
          providerId: routerResult.providerId,
          modelId: routerResult.modelId,
          fallbackUsed: routerResult.fallbackUsed,
          fallbackReason: routerResult.fallbackReason,
          latencyMs: Date.now() - startedAt,
        },
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (err: unknown) {
      const isRouterError = err instanceof RouterError;
      const latencyMs = Date.now() - startedAt;

      traceAILogger.logRequestEvent({
        requestId,
        task: params.task,
        providerId: "none",
        modelId: "none",
        startedAt: new Date(startedAt).toISOString(),
        completedAt: new Date().toISOString(),
        latencyMs,
        fallbackUsed: false,
        retryCount: 0,
        timeoutMs: 12000,
        success: false,
        errorCode: isRouterError ? err.code : "INTERNAL_ERROR",
        toolCallCount: 0,
        citationCount: 0,
      });

      // INVARIANT: Failed AI never breaks the deterministic result.
      // Return unavailable status — the frontend still has the result.
      return {
        requestId,
        status: "unavailable",
        answer: "",
        citations: [],
        followUpQuestions: params.attributionResult
          ? generateFollowUps({ attributionResult: params.attributionResult }).questions
          : [],
        evidenceUsed: [],
        warnings: [
          {
            code: "PROVIDER_UNAVAILABLE",
            severity: "caution",
            message:
              isRouterError
                ? err.message
                : "Trace AI is temporarily unavailable. The attribution result is still available.",
            affectedCapability: "ai_explanation",
          },
        ],
        unavailableReason:
          isRouterError ? err.message : "All AI providers failed. Please try again.",
      };
    }
  }
}

// ─── Singleton Export ─────────────────────────────────────────────────────────

export const traceAI = new TraceAI();

// ─── Re-exports for consumers ─────────────────────────────────────────────────

export type {
  AttributionResult,
  TraceAIResponse,
  TraceAIStatus,
  Citation,
  EvidenceReference,
  TraceAIWarning,
} from "./types";

export { toolRegistry } from "./tools/registry";
export { getInvestigationAgent } from "./agent/investigationAgent";
export { formatCitation } from "./citations/formatter";
export { normalizeAttributionResponse } from "../normalizer";
