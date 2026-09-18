/**
 * lib/traceAI/tools/registry.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Data-driven tool registry.
 *
 * INVARIANT: No if/else chains based on tool name in the agent loop.
 *   New tools are added by registering them here + implementing a handler.
 *   The core agent loop discovers tools through this registry.
 *
 * INVARIANT: Tool handlers MUST be thin wrappers:
 *   validate → resolve context → call shared domain function → normalize
 *   Business logic lives in domain functions, NOT in tool handlers.
 *
 * ARCHITECTURAL NOTE:
 *   This registry is designed so the same tool manifests can be reused
 *   for both internal Trace AI use and external MCP exposure.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type {
  TraceToolDefinition,
  TraceToolCall,
  TraceToolResult,
  AttributionResult,
} from "../types";
import { traceAILogger } from "../observability/logger";
import { executeGetPathDetails } from "./getPathDetails";
import { executeCheckSanctionsStatus } from "./checkSanctionsStatus";
import { executeResolveENS } from "./resolveENS";

// ─── Tool Handler Type ────────────────────────────────────────────────────────

export interface ToolExecutionContext {
  /** The current investigation's attribution result (read-only) */
  attributionResult?: AttributionResult;
  /** Authenticated org/user context for authorization */
  orgId?: string;
  userId?: string;
  /** Per-request budget tracking */
  remainingBudgetUsd?: number;
}

export type ToolHandler = (
  input: unknown,
  context: ToolExecutionContext
) => Promise<TraceToolResult>;

export interface RegisteredTool {
  definition: TraceToolDefinition;
  handler: ToolHandler;
  /** MCP-compatible manifest for external exposure */
  mcpManifest: {
    name: string;
    description: string;
    inputSchema: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
    riskTier: string;
    requiredScopes: string[];
    version: string;
  };
}

// ─── Registry ────────────────────────────────────────────────────────────────

class TraceToolRegistry {
  private tools: Map<string, RegisteredTool> = new Map();

  register(tool: RegisteredTool): void {
    if (this.tools.has(tool.definition.name)) {
      throw new Error(`Tool already registered: ${tool.definition.name}`);
    }
    this.tools.set(tool.definition.name, tool);
    traceAILogger.debug(`[ToolRegistry] Registered tool: ${tool.definition.name}`);
  }

  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  list(): RegisteredTool[] {
    return Array.from(this.tools.values());
  }

  definitions(): TraceToolDefinition[] {
    return this.list().map((t) => t.definition);
  }

  mcpManifests(): RegisteredTool["mcpManifest"][] {
    return this.list().map((t) => t.mcpManifest);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Execute a tool call with validation, authorization, and audit logging.
   * This is the single dispatch path — the agent loop calls this, not individual handlers.
   */
  async execute(
    call: TraceToolCall,
    context: ToolExecutionContext
  ): Promise<TraceToolResult> {
    const tool = this.tools.get(call.toolName);

    if (!tool) {
      traceAILogger.warn(`[ToolRegistry] Unknown tool: ${call.toolName}`);
      return {
        callId: call.callId,
        toolName: call.toolName,
        status: "validation_failed",
        output: null,
        provenance: {
          toolName: call.toolName,
          executedAt: new Date().toISOString(),
          source: "registry",
          durationMs: 0,
        },
        error: {
          code: "UNKNOWN_TOOL",
          message: `Unknown tool: ${call.toolName}`,
          userMessage: `The requested tool '${call.toolName}' is not available.`,
        },
      };
    }

    // Cost budget check
    if (
      context.remainingBudgetUsd !== undefined &&
      tool.definition.costEstimate?.usdCents !== undefined
    ) {
      const costUsd = tool.definition.costEstimate.usdCents / 100;
      if (costUsd > context.remainingBudgetUsd) {
        return {
          callId: call.callId,
          toolName: call.toolName,
          status: "error",
          output: null,
          provenance: {
            toolName: call.toolName,
            executedAt: new Date().toISOString(),
            source: "registry",
            durationMs: 0,
          },
          error: {
            code: "BUDGET_EXCEEDED",
            message: `Tool ${call.toolName} would exceed remaining budget`,
            userMessage: "Investigation budget exceeded. This tool call was skipped.",
          },
        };
      }
    }

    traceAILogger.logToolCall(call.callId, call.toolName, "start");
    const startMs = Date.now();

    // Create a timeout wrapper around the tool's configured timeout
    const timeoutMs = tool.definition.timeoutMs;

    try {
      const result = await Promise.race([
        tool.handler(call.input, context),
        new Promise<TraceToolResult>((_, reject) =>
          setTimeout(() => reject(new Error("TOOL_TIMEOUT")), timeoutMs)
        ),
      ]);

      traceAILogger.logToolCall(call.callId, call.toolName, "success", Date.now() - startMs);
      return result;
    } catch (err: unknown) {
      const durationMs = Date.now() - startMs;
      const isTimeout = err instanceof Error && err.message === "TOOL_TIMEOUT";
      const status = isTimeout ? "timeout" : "error";

      traceAILogger.logToolCall(call.callId, call.toolName, status, durationMs);

      return {
        callId: call.callId,
        toolName: call.toolName,
        status,
        output: null,
        provenance: {
          toolName: call.toolName,
          executedAt: new Date().toISOString(),
          source: "registry",
          durationMs,
        },
        error: {
          code: isTimeout ? "TOOL_TIMEOUT" : "INTERNAL_ERROR",
          message: String(err),
          // SECURITY: Never expose internal error details to users
          userMessage: isTimeout
            ? `The ${call.toolName} tool timed out. Results may be incomplete.`
            : `The ${call.toolName} tool encountered an error. Please try again.`,
        },
      };
    }
  }
}

// ─── Singleton Registry ───────────────────────────────────────────────────────

export const toolRegistry = new TraceToolRegistry();

// ─── Register Initial Tools ───────────────────────────────────────────────────

toolRegistry.register({
  definition: {
    name: "get_path_details",
    description:
      "Retrieve detailed hop-by-hop path evidence for a specific attribution path. " +
      "Returns address, transaction hash, asset, value, and timestamp for each hop.",
    inputSchema: {
      type: "object",
      properties: {
        pathIndex: {
          type: "number",
          description: "Zero-based index of the path to inspect",
          minimum: 0,
        },
      },
      required: ["pathIndex"],
    },
    riskTier: "read_only",
    timeoutMs: 5000,
    mcpExposable: true,
  },
  handler: executeGetPathDetails,
  mcpManifest: {
    name: "get_path_details",
    description: "Retrieve detailed hop-by-hop path evidence for a Trace attribution path.",
    inputSchema: {
      type: "object",
      properties: {
        pathIndex: { type: "number", description: "Zero-based path index" },
      },
      required: ["pathIndex"],
    },
    riskTier: "read_only",
    requiredScopes: ["attribute_address:read"],
    version: "1.0.0",
  },
});

toolRegistry.register({
  definition: {
    name: "check_sanctions_status",
    description:
      "Check the sanctions status of a blockchain address. " +
      "Returns MATCH, NO_MATCH, or UNKNOWN. UNKNOWN means the check could not be completed — " +
      "it does NOT mean the address is clean.",
    inputSchema: {
      type: "object",
      properties: {
        address: {
          type: "string",
          description: "Ethereum address to screen (0x...)",
        },
      },
      required: ["address"],
    },
    riskTier: "read_only",
    timeoutMs: 8000,
    mcpExposable: true,
  },
  handler: executeCheckSanctionsStatus,
  mcpManifest: {
    name: "check_sanctions_status",
    description:
      "Screen a blockchain address against sanctions lists. Returns MATCH, NO_MATCH, or UNKNOWN.",
    inputSchema: {
      type: "object",
      properties: {
        address: { type: "string", description: "Ethereum address to screen" },
      },
      required: ["address"],
    },
    riskTier: "read_only",
    requiredScopes: ["screen_sanctions:read"],
    version: "1.0.0",
  },
});

toolRegistry.register({
  definition: {
    name: "resolve_ens",
    description:
      "Resolve an ENS name for a blockchain address, or check if a given address has an ENS name. " +
      "Returns found, not_found, or unavailable. " +
      "not_found means no ENS name; unavailable means the resolver could not be reached.",
    inputSchema: {
      type: "object",
      properties: {
        address: {
          type: "string",
          description: "Ethereum address to look up (0x...)",
        },
      },
      required: ["address"],
    },
    riskTier: "read_only",
    timeoutMs: 5000,
    mcpExposable: true,
  },
  handler: executeResolveENS,
  mcpManifest: {
    name: "resolve_ens",
    description: "Resolve ENS name for a blockchain address.",
    inputSchema: {
      type: "object",
      properties: {
        address: { type: "string", description: "Ethereum address" },
      },
      required: ["address"],
    },
    riskTier: "read_only",
    requiredScopes: ["attribute_address:read"],
    version: "1.0.0",
  },
});
