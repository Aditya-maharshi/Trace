/**
 * lib/traceAI/observability/logger.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Structured logging for Trace AI.
 *
 * SECURITY INVARIANT:
 *   Never log: API keys, auth tokens, raw secrets, sensitive PII.
 *   Always log: requestId, task, provider, latency, error codes.
 *
 * Integration note:
 *   Replace the console.* calls here with your project's existing logger
 *   (e.g. Winston, Pino, Supabase Edge Function logs) when merging.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { TraceAIRequestEvent } from "../types";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  timestamp: string;
  source: "trace_ai";
  message: string;
  data?: Record<string, unknown>;
}

class TraceAILogger {
  private minLevel: LogLevel;

  constructor() {
    const envLevel = process.env.TRACE_AI_LOG_LEVEL as LogLevel | undefined;
    this.minLevel = envLevel ?? (process.env.NODE_ENV === "production" ? "info" : "debug");
  }

  private shouldLog(level: LogLevel): boolean {
    const order: LogLevel[] = ["debug", "info", "warn", "error"];
    return order.indexOf(level) >= order.indexOf(this.minLevel);
  }

  private format(level: LogLevel, message: string, data?: Record<string, unknown>): LogEntry {
    return {
      level,
      timestamp: new Date().toISOString(),
      source: "trace_ai",
      message,
      data,
    };
  }

  private output(entry: LogEntry): void {
    const line = JSON.stringify(entry);
    switch (entry.level) {
      case "error": console.error(line); break;
      case "warn": console.warn(line); break;
      case "debug": console.debug(line); break;
      default: console.log(line);
    }
  }

  debug(message: string, data?: Record<string, unknown>): void {
    if (this.shouldLog("debug")) this.output(this.format("debug", message, data));
  }

  info(message: string, data?: Record<string, unknown>): void {
    if (this.shouldLog("info")) this.output(this.format("info", message, data));
  }

  warn(message: string, data?: Record<string, unknown>): void {
    if (this.shouldLog("warn")) this.output(this.format("warn", message, data));
  }

  error(message: string, data?: Record<string, unknown>): void {
    if (this.shouldLog("error")) this.output(this.format("error", message, data));
  }

  /** Log a complete Trace AI request lifecycle event */
  logRequestEvent(event: TraceAIRequestEvent): void {
    const level: LogLevel = event.success ? "info" : "warn";
    this.output(
      this.format(level, `[TraceAI] Request ${event.requestId} — ${event.success ? "success" : "failed"}`, {
        requestId: event.requestId,
        task: event.task,
        providerId: event.providerId,
        modelId: event.modelId,
        latencyMs: event.latencyMs,
        fallbackUsed: event.fallbackUsed,
        fallbackReason: event.fallbackReason,
        retryCount: event.retryCount,
        success: event.success,
        errorCode: event.errorCode,
        toolCallCount: event.toolCallCount,
        citationCount: event.citationCount,
        // NOTE: question and investigationId are logged for audit purposes.
        // Do not add raw API keys, auth tokens, or sensitive content here.
        question: event.question ? `${event.question.slice(0, 100)}...` : undefined,
        investigationId: event.investigationId,
      })
    );
  }

  /** Log provider health state changes (circuit breaker) */
  logProviderHealthChange(
    providerId: string,
    from: "healthy" | "degraded" | "open",
    to: "healthy" | "degraded" | "open",
    reason: string
  ): void {
    this.warn(`[TraceAI] Provider health change: ${providerId}`, {
      providerId,
      from,
      to,
      reason,
    });
  }

  /** Log tool execution */
  logToolCall(
    callId: string,
    toolName: string,
    status: "start" | "success" | "error" | "timeout",
    durationMs?: number,
    errorCode?: string
  ): void {
    const level: LogLevel = status === "error" || status === "timeout" ? "warn" : "debug";
    this.output(
      this.format(level, `[TraceAI] Tool ${toolName} — ${status}`, {
        callId,
        toolName,
        status,
        durationMs,
        errorCode,
      })
    );
  }
}

// Singleton logger instance
export const traceAILogger = new TraceAILogger();
