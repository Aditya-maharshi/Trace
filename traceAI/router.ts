/**
 * lib/traceAI/router.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Task-aware provider router with circuit breakers, timeouts, and fallbacks.
 *
 * Routing:  "What task is this?" → "Which provider is appropriate?"
 * Fallback: "Preferred provider failed" → "Which compatible provider can take over?"
 *
 * These are maintained as SEPARATE concepts.
 *
 * INVARIANT:
 *   The router does NOT change deterministic Trace facts.
 *   Switching from Gemini → Groq changes the wording of an explanation.
 *   It NEVER changes score, risk, confidence, or VASP attribution.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type {
  AIProviderRequest,
  AIProviderResponse,
  AIStreamEvent,
  TraceAITask,
  TraceAIErrorCode,
} from "./types";
import { GeminiProvider, GeminiProviderError } from "./providers/gemini";
import { GroqProvider, GroqProviderError } from "./providers/groq";
import { traceAILogger } from "./observability/logger";
import { loadTraceAIConfig, TASK_ROUTING_POLICY } from "./config";
import type { ProviderConfig } from "./config";

// ─── Provider Health (Circuit Breaker) ───────────────────────────────────────

type ProviderHealth = "healthy" | "degraded" | "open"; // open = circuit is open = skip

interface ProviderHealthState {
  health: ProviderHealth;
  consecutiveFailures: number;
  lastFailedAt?: number;
  halfOpenProbeAllowed: boolean;
}

// ─── Provider Registry ────────────────────────────────────────────────────────

type ProviderInstance = GeminiProvider | GroqProvider;

// ─── Router ───────────────────────────────────────────────────────────────────

export interface RouterResult {
  response: AIProviderResponse;
  providerId: string;
  modelId: string;
  fallbackUsed: boolean;
  fallbackReason?: string;
  retryCount: number;
}

export interface RouterStreamResult {
  providerId: string;
  modelId: string;
  fallbackUsed: boolean;
  fallbackReason?: string;
  stream: AsyncGenerator<AIStreamEvent>;
}

export class TraceAIRouter {
  private providers: Map<string, ProviderInstance> = new Map();
  private health: Map<string, ProviderHealthState> = new Map();
  private configs: Map<string, ProviderConfig> = new Map();

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    const config = loadTraceAIConfig();

    for (const pc of config.providers) {
      const instance = this.createProvider(pc);
      if (instance) {
        this.providers.set(pc.id, instance);
        this.configs.set(pc.id, pc);
        this.health.set(pc.id, {
          health: "healthy",
          consecutiveFailures: 0,
          halfOpenProbeAllowed: true,
        });
      }
    }

    if (this.providers.size === 0) {
      traceAILogger.warn(
        "[Router] No AI providers configured. Trace AI will be unavailable. " +
          "Set GEMINI_API_KEY or GROQ_API_KEY."
      );
    }
  }

  private createProvider(config: ProviderConfig): ProviderInstance | null {
    switch (config.id) {
      case "gemini": {
        const key = process.env.GEMINI_API_KEY;
        if (!key) return null;
        return new GeminiProvider(key, config.model, config.timeoutMs);
      }
      case "groq": {
        const key = process.env.GROQ_API_KEY;
        if (!key) return null;
        return new GroqProvider(key, config.model, config.timeoutMs);
      }
      default:
        traceAILogger.warn(`[Router] Unknown provider id: ${config.id}`);
        return null;
    }
  }

  // ── Circuit Breaker ─────────────────────────────────────────────────────────

  private isProviderAvailable(providerId: string): boolean {
    const state = this.health.get(providerId);
    if (!state) return false;
    if (state.health === "healthy") return true;

    const config = this.configs.get(providerId)!;

    if (state.health === "open") {
      // Check if reset window has passed → allow a half-open probe
      const elapsed = Date.now() - (state.lastFailedAt ?? 0);
      if (elapsed >= config.circuitBreakerResetMs && state.halfOpenProbeAllowed) {
        traceAILogger.info(`[Router] Half-open probe allowed for ${providerId}`);
        state.halfOpenProbeAllowed = false;
        return true;
      }
      return false;
    }

    return state.health === "degraded"; // degraded still tries
  }

  private recordSuccess(providerId: string): void {
    const state = this.health.get(providerId);
    if (!state) return;
    if (state.health !== "healthy") {
      traceAILogger.logProviderHealthChange(providerId, state.health, "healthy", "Request succeeded");
    }
    state.health = "healthy";
    state.consecutiveFailures = 0;
    state.halfOpenProbeAllowed = true;
  }

  private recordFailure(providerId: string, isTransient: boolean): void {
    const state = this.health.get(providerId);
    const config = this.configs.get(providerId);
    if (!state || !config) return;

    state.consecutiveFailures++;
    state.lastFailedAt = Date.now();

    if (!isTransient) {
      // Terminal failure — open circuit immediately
      traceAILogger.logProviderHealthChange(providerId, state.health, "open", "Non-transient failure");
      state.health = "open";
    } else if (state.consecutiveFailures >= config.circuitBreakerThreshold) {
      traceAILogger.logProviderHealthChange(
        providerId,
        state.health,
        "open",
        `${state.consecutiveFailures} consecutive failures`
      );
      state.health = "open";
    } else {
      state.health = "degraded";
    }
  }

  // ── Provider Selection ──────────────────────────────────────────────────────

  private selectProviders(task: TraceAITask): string[] {
    const policy = TASK_ROUTING_POLICY[task];
    return policy.filter((id) => this.providers.has(id) && this.isProviderAvailable(id));
  }

  // ── Generate (non-streaming) ────────────────────────────────────────────────

  async generate(
    task: TraceAITask,
    request: Omit<AIProviderRequest, "task">
  ): Promise<RouterResult> {
    const ordered = this.selectProviders(task);

    if (ordered.length === 0) {
      throw new RouterError(
        "ALL_PROVIDERS_FAILED",
        "No AI providers are available for this task. " +
          "Check provider configuration and API keys.",
        false
      );
    }

    let fallbackUsed = false;
    let fallbackReason: string | undefined;
    let retryCount = 0;
    let firstProviderId = ordered[0];

    for (const providerId of ordered) {
      const provider = this.providers.get(providerId)!;
      const config = this.configs.get(providerId)!;
      const isFirstChoice = providerId === firstProviderId;

      if (!isFirstChoice) {
        fallbackUsed = true;
        if (!fallbackReason) {
          fallbackReason = `Primary provider unavailable`;
        }
      }

      const fullRequest: AIProviderRequest = { ...request, task };

      // Per-provider retry loop
      for (let attempt = 0; attempt < config.maxRetries; attempt++) {
        try {
          traceAILogger.debug(`[Router] Attempting ${providerId} for task=${task} attempt=${attempt}`);
          const response = await provider.generate(fullRequest);
          this.recordSuccess(providerId);
          return {
            response,
            providerId,
            modelId: config.model,
            fallbackUsed,
            fallbackReason,
            retryCount,
          };
        } catch (err: unknown) {
          retryCount++;
          const isTransient = isTransientError(err);
          this.recordFailure(providerId, isTransient);

          if (!isTransient || attempt >= config.maxRetries - 1) {
            // Break retry loop — either terminal failure or retries exhausted
            const reason = isTransient
              ? `${providerId} timed out after ${config.maxRetries} retries`
              : `${providerId} failed with non-transient error`;

            traceAILogger.warn(`[Router] Moving to next provider. Reason: ${reason}`);
            if (!fallbackReason) fallbackReason = reason;
            break; // try next provider
          }

          // Transient + more retries available → retry this provider
          await sleep(200 * (attempt + 1)); // simple backoff
        }
      }
    }

    throw new RouterError(
      "ALL_PROVIDERS_FAILED",
      "All configured AI providers failed. The deterministic Trace result is still available.",
      true
    );
  }

  // ── Stream ──────────────────────────────────────────────────────────────────

  async startStream(
    task: TraceAITask,
    request: Omit<AIProviderRequest, "task">
  ): Promise<RouterStreamResult> {
    const ordered = this.selectProviders(task);

    if (ordered.length === 0) {
      throw new RouterError(
        "ALL_PROVIDERS_FAILED",
        "No AI providers are available.",
        false
      );
    }

    let fallbackUsed = false;
    let fallbackReason: string | undefined;

    for (let i = 0; i < ordered.length; i++) {
      const providerId = ordered[i];
      const provider = this.providers.get(providerId)!;
      const config = this.configs.get(providerId)!;

      if (i > 0) {
        fallbackUsed = true;
        fallbackReason = fallbackReason ?? `Primary provider unavailable`;
      }

      const fullRequest: AIProviderRequest = { ...request, task };

      if ("stream" in provider && typeof (provider as GeminiProvider).stream === "function") {
        try {
          const gen = (provider as GeminiProvider).stream(fullRequest);
          
          // Test the connection by requesting the first chunk
          const first = await gen.next();
          
          this.recordSuccess(providerId);
          
          async function* wrappedGenerator() {
            if (!first.done) {
              yield first.value;
              for await (const chunk of gen) {
                yield chunk;
              }
            }
          }

          return {
            providerId,
            modelId: config.model,
            fallbackUsed,
            fallbackReason,
            stream: wrappedGenerator(),
          };
        } catch (err) {
          const isTransient = isTransientError(err);
          this.recordFailure(providerId, isTransient);
          fallbackReason = `${providerId} stream failed`;
          continue;
        }
      }
    }

    throw new RouterError("ALL_PROVIDERS_FAILED", "No providers support streaming or all failed.", false);
  }

  // ── Health Report ───────────────────────────────────────────────────────────

  getHealthReport(): Record<string, { health: ProviderHealth; consecutiveFailures: number }> {
    const report: Record<string, { health: ProviderHealth; consecutiveFailures: number }> = {};
    for (const [id, state] of this.health.entries()) {
      report[id] = { health: state.health, consecutiveFailures: state.consecutiveFailures };
    }
    return report;
  }
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export class RouterError extends Error {
  constructor(
    public readonly code: TraceAIErrorCode,
    message: string,
    public readonly isTransient: boolean
  ) {
    super(message);
    this.name = "RouterError";
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isTransientError(err: unknown): boolean {
  if (err instanceof GeminiProviderError) return err.isTransient;
  if (err instanceof GroqProviderError) return err.isTransient;
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes("timeout") || msg.includes("rate") || msg.includes("503");
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _router: TraceAIRouter | null = null;

export function getRouter(): TraceAIRouter {
  if (!_router) {
    _router = new TraceAIRouter();
  }
  return _router;
}
