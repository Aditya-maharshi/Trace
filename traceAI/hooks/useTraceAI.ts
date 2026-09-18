/**
 * lib/traceAI/hooks/useTraceAI.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * React hook for Trace AI chat, streaming, and citation rendering.
 *
 * USAGE:
 *   const { messages, ask, status, isStreaming } = useTraceAI({ attributionId })
 *
 * INVARIANT: The hook never holds raw attribution JSON.
 *   It sends an attributionId (reference). The server resolves the data.
 *
 * INVARIANT: The hook never calls provider APIs directly.
 *   All AI calls go through /api/chat or /api/trace-ai/stream.
 *
 * STREAMING EVENTS handled here:
 *   token → append to current message
 *   citation → append to current message's citations array
 *   followups → update followUpQuestions
 *   error → set error state (non-fatal; message still shows partial text)
 *   done → finalize current message
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use client";

import { useState, useCallback, useRef } from "react";
import type { Citation, TraceAIWarning } from "../types";

// ─── Message Model ────────────────────────────────────────────────────────────

export type MessageRole = "user" | "assistant" | "system";
export type MessageStatus = "streaming" | "complete" | "error";

export interface TraceAIMessage {
  id: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  citations: Citation[];
  warnings?: TraceAIWarning[];
  followUpQuestions?: string[];
  providerMeta?: {
    providerId: string;
    modelId: string;
    fallbackUsed: boolean;
    latencyMs: number;
  };
  timestamp: number;
}

// ─── Hook State ───────────────────────────────────────────────────────────────

export type TraceAIStatus = "idle" | "loading" | "streaming" | "error";

export interface UseTraceAIOptions {
  /** Reference ID of the attribution result (server resolves — not raw JSON) */
  attributionId?: string;
  /** POST endpoint for non-streaming requests */
  chatEndpoint?: string;
  /** POST endpoint for SSE streaming */
  streamEndpoint?: string;
  /** Max messages to keep in history (older ones trimmed) */
  maxHistoryLength?: number;
}

export interface UseTraceAIReturn {
  messages: TraceAIMessage[];
  status: TraceAIStatus;
  isStreaming: boolean;
  error: string | null;
  followUpQuestions: string[];
  /** Send a question (always uses streaming if available) */
  ask: (question: string, options?: { audience?: "analyst" | "plain_english" | "board", task?: string }) => Promise<void>;
  /** Clear all messages */
  reset: () => void;
  /** Cancel an in-progress stream */
  cancel: () => void;
  /** Use a follow-up question as the next message */
  askFollowUp: (question: string) => Promise<void>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

let messageIdCounter = 0;
const nextId = () => `msg-${Date.now()}-${++messageIdCounter}`;

export function useTraceAI(options: UseTraceAIOptions = {}): UseTraceAIReturn {
  const {
    attributionId,
    chatEndpoint = "/api/chat",
    streamEndpoint = "/api/trace-ai/stream",
    maxHistoryLength = 20,
  } = options;

  const [messages, setMessages] = useState<TraceAIMessage[]>([]);
  const [status, setStatus] = useState<TraceAIStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [followUpQuestions, setFollowUpQuestions] = useState<string[]>([]);

  const abortRef = useRef<AbortController | null>(null);

  // ── Ask (streaming) ─────────────────────────────────────────────────────────

  const ask = useCallback(
    async (question: string, options?: { audience?: "analyst" | "plain_english" | "board", task?: string }): Promise<void> => {
      if (!question.trim()) return;
      if (status === "streaming" || status === "loading") {
        abortRef.current?.abort();
      }

      setError(null);
      setStatus("loading");

      // Add user message
      const userMsg: TraceAIMessage = {
        id: nextId(),
        role: "user",
        content: question,
        status: "complete",
        citations: [],
        timestamp: Date.now(),
      };

      const assistantMsgId = nextId();
      const assistantMsg: TraceAIMessage = {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        status: "streaming",
        citations: [],
        timestamp: Date.now(),
      };

      setMessages((prev) => {
        const trimmed =
          prev.length >= maxHistoryLength ? prev.slice(-maxHistoryLength + 2) : prev;
        return [...trimmed, userMsg, assistantMsg];
      });

      // Build conversation history for context
      const conversationHistory = messages
        .filter((m) => m.status === "complete")
        .slice(-10)
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
          timestamp: new Date(m.timestamp).toISOString(),
        }));

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch(streamEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question,
            attributionId,
            conversationHistory,
            audience: options?.audience,
            task: options?.task ?? "follow_up",
          }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`Server responded ${response.status}`);
        }

        setStatus("streaming");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;

            let event: { type: string; payload: unknown };
            try {
              event = JSON.parse(jsonStr);
            } catch {
              continue;
            }

            handleStreamEvent(event.type, event.payload, assistantMsgId);
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          // User cancelled — mark as complete with whatever we have
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId ? { ...m, status: "complete" } : m
            )
          );
          setStatus("idle");
          return;
        }

        const errorMsg =
          err instanceof Error ? err.message : "Request failed";
        setError(errorMsg);

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  status: "error",
                  warnings: [
                    {
                      code: "STREAM_ERROR",
                      severity: "caution" as const,
                      message:
                        "Trace AI is temporarily unavailable. The attribution result is still accessible.",
                      affectedCapability: "ai_explanation",
                    },
                  ],
                }
              : m
          )
        );
        setStatus("error");
      }
    },
    [messages, attributionId, streamEndpoint, status, maxHistoryLength]
  );

  // ── Stream Event Handler ────────────────────────────────────────────────────

  function handleStreamEvent(
    type: string,
    payload: unknown,
    assistantMsgId: string
  ) {
    switch (type) {
      case "token": {
        const { text } = payload as { text: string };
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, content: m.content + text }
              : m
          )
        );
        break;
      }

      case "citation": {
        const { citation } = payload as { citation: Citation };
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  citations: [
                    ...m.citations.filter((c) => c.id !== citation.id),
                    citation,
                  ],
                }
              : m
          )
        );
        break;
      }

      case "followups": {
        const { questions } = payload as { questions: string[] };
        setFollowUpQuestions(questions ?? []);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, followUpQuestions: questions }
              : m
          )
        );
        break;
      }

      case "error": {
        const { message, recoverable } = payload as {
          message: string;
          recoverable: boolean;
        };
        
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  status: recoverable ? m.status : "error",
                  warnings: [
                    ...(m.warnings ?? []),
                    {
                      code: "STREAM_ERROR",
                      severity: "caution",
                      message,
                    },
                  ],
                }
              : m
          )
        );

        if (!recoverable) {
          setError(message);
          setStatus("error");
        }
        break;
      }

      case "done": {
        const meta = payload as {
          requestId: string;
          status: string;
          citationCount: number;
          latencyMs: number;
          fallbackUsed: boolean;
        };
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  status: "complete",
                  providerMeta: meta.fallbackUsed
                    ? {
                        providerId: "fallback",
                        modelId: "fallback",
                        fallbackUsed: true,
                        latencyMs: meta.latencyMs,
                      }
                    : undefined,
                }
              : m
          )
        );
        setStatus("idle");
        break;
      }
    }
  }

  // ── Reset ───────────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setStatus("idle");
    setError(null);
    setFollowUpQuestions([]);
  }, []);

  // ── Cancel ──────────────────────────────────────────────────────────────────

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // ── Ask Follow-up ───────────────────────────────────────────────────────────

  const askFollowUp = useCallback(
    (question: string) => ask(question),
    [ask]
  );

  return {
    messages,
    status,
    isStreaming: status === "streaming",
    error,
    followUpQuestions,
    ask,
    reset,
    cancel,
    askFollowUp,
  };
}
