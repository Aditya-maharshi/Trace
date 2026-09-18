/**
 * lib/traceAI/types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Canonical type definitions for the Trace AI intelligence subsystem.
 *
 * ARCHITECTURAL INVARIANT:
 *   These types sit above the deterministic engine. Trace AI may READ these
 *   values but may NEVER write back to them or recalculate them.
 *
 * PROVIDER INVARIANT:
 *   No provider-specific type leaks out of lib/traceAI/providers/.
 *   All consumers use these shared types only.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Task Classification ─────────────────────────────────────────────────────

/**
 * Every Trace AI request is classified into one task type.
 * The router uses this to select the appropriate provider + model.
 */
export type TraceAITask =
  | "narrative"           // Explain a deterministic attribution result
  | "follow_up"           // Answer a follow-up question in a conversation
  | "evidence_explanation"// Explain a specific piece of evidence
  | "investigation"       // Multi-step autonomous investigation (agent mode)
  | "agent_step_narration"// Narrate a single agent step result
  | "artifact_narrative"  // Write constrained prose for a legal/compliance artifact
  | "followup_generation" // Generate suggested follow-up questions
  | "score_explanation"   // Plain language explanation of score breakdown
  | "glossary_definition";// Lightweight hover-tooltip definition

// ─── Trace AI Status ─────────────────────────────────────────────────────────

export type TraceAIStatus =
  | "success"     // Full answer with all evidence
  | "partial"     // Answer returned but some evidence sources were unavailable
  | "degraded"    // Answer returned via fallback provider
  | "unavailable" // All providers failed — deterministic result still available
  | "blocked";    // Request blocked (auth, scope, budget)

// ─── Provider Interface ───────────────────────────────────────────────────────

export interface AIProviderRequest {
  task: TraceAITask;
  systemPrompt: string;
  userMessage: string;
  /** Structured context delivered as data, not instructions */
  evidenceContext?: EvidenceContext;
  tools?: TraceToolDefinition[];
  maxOutputTokens?: number;
  conversationHistory?: ConversationMessage[];
  audience?: "analyst" | "plain_english" | "board";
}

export interface AIProviderResponse {
  text: string;
  providerId: string;
  modelId: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  latencyMs: number;
  toolCalls?: TraceToolCall[];
  finishReason?: "stop" | "tool_use" | "length" | "error";
}

export interface AIStreamEvent {
  type: "token" | "citation" | "tool_start" | "tool_result" | "followups" | "error" | "done";
  payload: unknown;
}

/** Token-by-token prose chunk */
export interface TokenEvent {
  type: "token";
  payload: { text: string };
}

/** Server-resolved citation (never raw LLM-fabricated) */
export interface CitationEvent {
  type: "citation";
  payload: { citation: Citation; marker: string };
}

/** Tool execution started */
export interface ToolStartEvent {
  type: "tool_start";
  payload: { callId: string; toolName: string; input: unknown };
}

/** Tool execution completed */
export interface ToolResultEvent {
  type: "tool_result";
  payload: TraceToolResult;
}

/** Suggested follow-up questions */
export interface FollowupsEvent {
  type: "followups";
  payload: { questions: string[] };
}

/** Structured error */
export interface ErrorEvent {
  type: "error";
  payload: { code: TraceAIErrorCode; message: string; recoverable: boolean };
}

/** Stream completion with summary */
export interface DoneEvent {
  type: "done";
  payload: {
    requestId: string;
    status: TraceAIStatus;
    citationCount: number;
    toolCallCount: number;
    latencyMs: number;
    fallbackUsed: boolean;
  };
}

// ─── Error Taxonomy ───────────────────────────────────────────────────────────

export type TraceAIErrorCode =
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_UNAVAILABLE"
  | "ALL_PROVIDERS_FAILED"
  | "AUTHENTICATION_FAILED"
  | "AUTHORIZATION_FAILED"
  | "BUDGET_EXCEEDED"
  | "TOOL_TIMEOUT"
  | "TOOL_VALIDATION_FAILED"
  | "TOOL_UNAVAILABLE"
  | "SOURCE_UNAVAILABLE"   // External evidence source failed
  | "CITATION_INVALID"
  | "INTERNAL_ERROR";

// ─── Citation System ─────────────────────────────────────────────────────────

/**
 * INVARIANT: Citations are ONLY created from server-side authoritative data.
 * The LLM emits citation markers (e.g. [[cite:abc123]]) which are resolved
 * server-side. The LLM never creates citation content directly.
 */
export type Citation =
  | {
      type: "path_hop";
      id: string;
      pathIndex: number;
      hopIndex: number;
      address?: string;
      transactionHash?: string;
      asset?: string;
      value?: string;
      timestamp?: string;
    }
  | {
      type: "transaction";
      id: string;
      chain: string;
      txHash: string;
      explorerUrl?: string;  // Generated by trusted code, NOT the LLM
      block?: number;
      timestamp?: string;
    }
  | {
      type: "sanctions_match";
      id: string;
      matchId: string;
      source: string;
      entityName?: string;
      queryAddress: string;
      screenedAt: string;
    }
  | {
      type: "vasp_label";
      id: string;
      address: string;
      vaspName: string;
      provider: string;
      label: string;
      sourceUrl?: string;    // Trusted source URL only
      datasetVersion?: string;
      refreshedAt?: string;
    }
  | {
      type: "bridge_contract";
      id: string;
      chain: string;
      contractAddress: string;
      verifiedLabel?: string;
      sourceUrl?: string;
      exitStatus: "confirmed" | "suspected" | "unknown";
    }
  | {
      type: "ens";
      id: string;
      address: string;
      ensName: string;
      resolvedAt?: string;
      source?: string;
    }
  | {
      type: "methodology";
      id: string;
      key: string;
      description?: string;
      source?: string;
    };

/** UI navigation target for a citation click */
export interface CitationLocator {
  target:
    | { type: "graph_hop"; pathIndex: number; hopIndex: number }
    | { type: "path_row"; pathIndex: number }
    | { type: "transaction"; chain: string; txHash: string }
    | { type: "sanctions_panel"; matchId?: string }
    | { type: "vasp_panel"; address: string }
    | { type: "methodology_footer" }
    | { type: "external_url"; url: string };
}

// ─── Evidence References ──────────────────────────────────────────────────────

/**
 * Bridge between tool output and citation.
 * Trace AI assembles answers from EvidenceReferences; citations are generated
 * from these references, not from LLM-free text.
 */
export interface EvidenceReference {
  id: string;           // Stable ID within this response
  type: string;         // e.g. "path_hop", "sanctions_match"
  source: string;       // e.g. "trace_engine", "opensanctions", "etherscan"
  freshness?: string;   // ISO timestamp when data was retrieved
  sourceVersion?: string;
  locator?: CitationLocator;
  // The actual structured data for this piece of evidence
  data: Record<string, unknown>;
}

export interface EvidenceContext {
  attributionResult?: AttributionResult;
  evidenceRefs?: EvidenceReference[];
  /** Trust levels for each evidence piece — drives caveat generation */
  sourceTrust?: Record<string, "authoritative" | "corroborating" | "unverified" | "stale" | "unavailable">;
}

// ─── Canonical Attribution Result ─────────────────────────────────────────────
//
// This is the SINGLE canonical shape that all frontend components and Trace AI
// receive. Produced by lib/normalizer.ts from the raw API response.
// NEVER modify scorePath/combineScores/toConfidence — read those values here.
//
export interface AttributionResult {
  // ── Core deterministic result (READ-ONLY for Trace AI) ───────────────────
  address: string;
  nearestVasp: string | null;
  score: number;
  confidence: "High" | "Medium" | "Low" | "None";
  risk: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
  hops: number;

  // ── Path evidence ────────────────────────────────────────────────────────
  paths: PathResult[];
  topVasps: VaspCandidate[];

  // ── Score breakdown (from deterministic engine, not recalculated) ────────
  breakdown?: ScoreBreakdown;

  // ── Extended signals ────────────────────────────────────────────────────
  sanctionsDetail?: SanctionsDetail;
  mixerExposure?: MixerExposureDetail;
  structuringSignalDetected?: boolean;
  structuringFlaggedHops?: number[];
  bridgeExitPoints?: BridgeExitPoint[];
  traceExitedToBridge?: boolean;
  ensNames?: Record<string, string>; // address → ENS name
  assetsInvolved?: AssetDetail[];

  // ── Methodology ─────────────────────────────────────────────────────────
  methodology?: MethodologyInfo;

  // ── Source tracking ─────────────────────────────────────────────────────
  computedAt: string;  // ISO timestamp
  traceVersion?: string;
}

export interface PathResult {
  pathIndex: number;
  vasp: string;
  score: number;
  hops: PathHop[];
  totalValueUSD?: number;
  daysSinceLastTx?: number;
}

export interface PathHop {
  hopIndex: number;
  address: string;
  from?: string;
  to?: string;
  transactionHash?: string;
  asset?: string;
  value?: string;
  valueUSD?: number;
  timestamp?: string;
  blockNumber?: number;
  metadata?: Record<string, string>;
  // Risk signals at this hop
  isMixer?: boolean;
  isBridge?: boolean;
  isSanctioned?: boolean;
}

export interface VaspCandidate {
  vasp: string;
  score: number;
  hops: number;
  confidence: "High" | "Medium" | "Low" | "None";
}

export interface ScoreBreakdown {
  hopFactor: number;
  valueFactor: number;
  recencyFactor: number;
  rawScore: number;
  normalizedScore: number;
  formula?: string;
}

export interface SanctionsDetail {
  /** Never collapse API failure into NO_MATCH */
  status: "MATCH" | "NO_MATCH" | "UNKNOWN";
  matches?: SanctionsMatch[];
  source?: string;
  screenedAt?: string;
  unavailableReason?: string; // Set when status = UNKNOWN
}

export interface SanctionsMatch {
  matchId: string;
  entityName: string;
  source: string;
  listName?: string;
  matchedAddress?: string;
}

export interface MixerExposureDetail {
  detected: boolean;
  exposure?: number;      // 0–1 taint percentage
  mixerAddresses?: string[];
  detectionMethod?: string;
}

export interface BridgeExitPoint {
  hopIndex: number;
  contractAddress: string;
  chain: string;
  verifiedLabel?: string;
  destinationChain?: string;
  /** Bridge exit = tracing caveat, NOT automatically a risk signal */
  exitStatus: "confirmed" | "suspected" | "unknown";
}

export interface AssetDetail {
  asset: string;
  symbol: string;
  totalValue?: string;
  decimals?: number;
  contractAddress?: string;
}

export interface MethodologyInfo {
  vaspDatasetSource?: string;
  vaspDatasetSize?: number;
  vaspDatasetRefreshedAt?: string;
  confidenceCalibrationSample?: number;
  confidenceCalibrationDate?: string;
  sanctionsSource?: string;
  scoreFormula?: string;
  disclaimer?: string;
}

// ─── Tool System ──────────────────────────────────────────────────────────────

/**
 * INVARIANT: Tool handlers call shared domain functions.
 * They do NOT duplicate business logic.
 * The same underlying function must be callable from REST, Trace AI, and MCP.
 */
export interface TraceToolDefinition {
  name: string;
  description: string;
  /** JSON Schema for input validation */
  inputSchema: Record<string, unknown>;
  /** Controls human-in-the-loop gating */
  riskTier: "read_only" | "costly_read" | "mutating" | "irreversible";
  costEstimate?: {
    units?: number;
    usdCents?: number;
  };
  timeoutMs: number;
  /** Whether this tool can be exposed via external MCP */
  mcpExposable: boolean;
}

export interface TraceToolCall {
  callId: string;
  toolName: string;
  input: unknown;
}

export interface TraceToolResult {
  callId: string;
  toolName: string;
  status: "success" | "error" | "timeout" | "validation_failed";
  /** Raw structured output — preserved separately from any narrative */
  output: unknown;
  /** Tool result metadata for citation construction */
  provenance: ToolProvenance;
  /** Pre-built evidence references for citation system */
  evidenceRefs?: EvidenceReference[];
  error?: {
    code: string;
    message: string;
    /** Sanitized — never exposes stack traces or DB details */
    userMessage: string;
  };
}

export interface ToolProvenance {
  toolName: string;
  executedAt: string;
  source: string;
  sourceVersion?: string;
  freshness?: string;
  durationMs: number;
}

// ─── Agent System ────────────────────────────────────────────────────────────

export type AgentTerminationReason =
  | "completed_definitive"    // Clear attribution established
  | "completed_max_steps"     // Reached configured step limit
  | "completed_manual_stop"   // Analyst stopped the run
  | "failed_budget"           // Budget ceiling hit
  | "paused"                  // Waiting for human approval
  | "cancelled"               // Explicitly cancelled
  | "failed_all_tools"        // All available tools failed
  | "failed_internal";        // Internal error

export type AgentStepStatus = "running" | "success" | "failed" | "skipped" | "paused";

export interface AgentStep {
  index: number;
  type: "tool" | "fallback" | "decision" | "narrative" | "approval";
  toolName?: string;
  input?: unknown;
  /** Raw tool output — MUST survive separately from narrative */
  rawOutput?: unknown;
  /** AI-generated explanation of this step — separate from rawOutput */
  narrative?: string;
  citations?: Citation[];
  riskTier?: string;
  status: AgentStepStatus;
  startedAt: string;
  completedAt?: string;
  errorClass?: string;
  /** Why the agent deviated from the default plan (auditable action explanation) */
  deviationReason?: string;
}

export interface AgentRunState {
  runId: string;
  caseId?: string;
  walletAddress: string;
  status: "running" | "completed" | "failed" | "paused" | "cancelled";
  steps: AgentStep[];
  /** Maximum USD budget for this run (tools can have costs) */
  budgetUsd?: number;
  /** Accumulated cost so far */
  spentUsd?: number;
  maxSteps: number;
  startedBy?: string;
  startedAt: string;
  completedAt?: string;
  terminationReason?: AgentTerminationReason;
  /** Attribution result that triggered this investigation */
  attributionResult?: AttributionResult;
  /** Final evidence-grounded findings (separate from step narratives) */
  findings?: string;
  citations?: Citation[];
}

// ─── Pending Actions (Human-in-the-loop) ────────────────────────────────────

export interface AgentPendingAction {
  actionId: string;
  runId: string;
  toolName: string;
  riskTier: "mutating" | "irreversible";
  input: unknown;
  reason: string;     // Why the agent wants to take this action
  requestedAt: string;
  status: "pending" | "approved" | "denied";
  reviewedBy?: string;
  reviewedAt?: string;
  denialReason?: string;
}

// ─── Provider Observability ───────────────────────────────────────────────────

/** Persisted for every Trace AI request — enables audit/reproduction */
export interface TraceAIRequestEvent {
  requestId: string;
  task: TraceAITask;
  providerId: string;
  modelId: string;
  startedAt: string;
  completedAt?: string;
  latencyMs?: number;
  fallbackUsed: boolean;
  fallbackReason?: string;
  retryCount: number;
  timeoutMs: number;
  success: boolean;
  errorCode?: TraceAIErrorCode;
  tokenUsage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  toolCallCount: number;
  citationCount: number;
  /** Never log secrets, API keys, or auth tokens */
  question?: string;
  investigationId?: string;
}

// ─── Normalized Trace AI Response ────────────────────────────────────────────

/** The application-level response. Consumers never see raw provider responses. */
export interface TraceAIResponse {
  requestId: string;
  status: TraceAIStatus;

  /** Evidence-grounded answer with citation markers resolved */
  answer: string;

  /** Resolved citations — never LLM-fabricated */
  citations: Citation[];

  /** Generated follow-up questions */
  followUpQuestions: string[];

  /** Evidence sources used in this response */
  evidenceUsed: EvidenceReference[];

  /**
   * Provider metadata — NEVER shown in normal UI.
   * Available for internal/admin/debug views only.
   */
  providerMeta?: {
    providerId: string;
    modelId: string;
    fallbackUsed: boolean;
    fallbackReason?: string;
    latencyMs: number;
  };

  toolCalls?: TraceToolResult[];

  /** Explicit warnings for the investigator (source failures, caveats, etc.) */
  warnings?: TraceAIWarning[];

  /** Never undefined — use "unavailable" status instead of null answer */
  unavailableReason?: string;
}

export interface TraceAIWarning {
  code: string;
  severity: "info" | "caution" | "critical";
  message: string;
  /** What the system could NOT determine due to this warning */
  affectedCapability?: string;
}

// ─── Conversation ─────────────────────────────────────────────────────────────

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  citationIds?: string[];
  timestamp: string;
}

export interface TraceAIChatRequest {
  conversationId?: string;
  question: string;
  /** Server resolves this — clients must NOT supply raw attribution JSON */
  attributionId?: string;
  /** Used for context validation */
  contextVersion?: string;
  audience?: "analyst" | "plain_english" | "board";
}

// ─── MCP Contract ────────────────────────────────────────────────────────────

/**
 * MCP-compatible tool manifest.
 * Internal tools reuse the same structure as external MCP tools.
 * INVARIANT: Changing a tool definition here affects both internal and
 * external consumers — treat as a versioned API.
 */
export interface MCPToolManifest {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  riskTier: "read_only" | "costly_read" | "mutating" | "irreversible";
  /** Available MCP scopes required to call this tool */
  requiredScopes: string[];
  version: string;
}

export type MCPErrorCode =
  | "INVALID_ADDRESS_FORMAT"
  | "AUTHENTICATION_FAILED"
  | "AUTHORIZATION_FAILED"
  | "SCOPE_INSUFFICIENT"
  | "RATE_LIMITED"
  | "TOOL_TIMEOUT"
  | "SOURCE_UNAVAILABLE"
  | "INTERNAL_ERROR"
  | "INVALID_STATE";

export interface MCPErrorResponse {
  isError: true;
  error_code: MCPErrorCode;
  path?: string;
  /** Safe user-facing message — never leaks internals */
  message: string;
}

// ─── Follow-up Generation ─────────────────────────────────────────────────────

export interface FollowUpGenerationInput {
  attributionResult: AttributionResult;
  previousQuestion?: string;
  previousAnswer?: string;
  availableTools?: string[];
}

export interface FollowUpGenerationOutput {
  questions: string[];
  source: "deterministic" | "llm" | "hybrid";
}

// ─── Feedback System ──────────────────────────────────────────────────────────

export type FeedbackRating = "up" | "down";

export interface FeedbackEvent {
  feedbackId: string;
  requestId: string;
  rating: FeedbackRating;
  comment?: string;
  /** Analyst who submitted feedback (optional — anonymous by default) */
  analystId?: string;
  submittedAt: string;
  /** Snapshot of the AI answer being rated */
  answerSnippet?: string;
}

export interface FeedbackSummary {
  totalUp: number;
  totalDown: number;
  /** Human-readable changelog entries of what feedback triggered */
  changelog: ChangelogEntry[];
}

export interface ChangelogEntry {
  date: string;
  description: string;
  triggeredBy: "analyst_feedback" | "manual";
}
