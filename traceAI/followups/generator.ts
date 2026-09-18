/**
 * lib/traceAI/followups/generator.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Dynamic follow-up question generation.
 *
 * TWO-TIER APPROACH:
 *   Tier 1 (always available): Deterministic rule-based questions derived
 *     from the attribution result's actual signals.
 *   Tier 2 (optional): LLM-refined wording for a more natural feel.
 *
 * INVARIANT: If LLM generation fails, Tier 1 questions are used.
 *   The feature NEVER disappears. Generic unrelated questions are NEVER shown.
 *
 * INVARIANT: Questions are tied to ACTUAL evidence in the result.
 *   "What is Bitcoin?" is never suggested unless context truly calls for it.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type {
  AttributionResult,
  FollowUpGenerationInput,
  FollowUpGenerationOutput,
} from "../types";

const MAX_QUESTIONS = 4;
const MIN_QUESTIONS = 2;
const MAX_QUESTION_LENGTH = 120;

// ─── Tier 1: Deterministic Question Generation ────────────────────────────────

/**
 * Generates follow-up questions deterministically from result signals.
 * No LLM required — always works even when providers are unavailable.
 */
export function generateDeterministicFollowUps(
  input: FollowUpGenerationInput
): string[] {
  const result = input.attributionResult;
  const questions: string[] = [];

  // 1. Confidence-based
  if (result.confidence === "Medium") {
    questions.push("Why is the confidence only Medium? What evidence is limiting it?");
  } else if (result.confidence === "Low" || result.confidence === "None") {
    questions.push("Why is the confidence Low? Is there insufficient path evidence?");
  }

  // 2. Multiple VASP candidates
  if (result.topVasps && result.topVasps.length > 1) {
    const second = result.topVasps[1];
    questions.push(`What are the alternative VASP candidates? Is ${second.vasp} a realistic attribution?`);
  }

  // 3. Mixer exposure
  if (result.mixerExposure?.detected) {
    questions.push("Which mixer was detected? How much of the path passes through mixing activity?");
  }

  // 4. Structuring signal
  if (result.structuringSignalDetected) {
    questions.push("Where was structuring detected? Which hops show the fragmented transfer pattern?");
  }

  // 5. Bridge exit
  if (result.traceExitedToBridge || (result.bridgeExitPoints?.length ?? 0) > 0) {
    questions.push(
      "The trace ended at a bridge contract. What does this mean for the attribution, and can the destination chain be investigated?"
    );
  }

  // 6. Sanctions
  if (result.sanctionsDetail?.status === "MATCH") {
    questions.push(`Who is the sanctioned entity? Which source list flagged this match?`);
  } else if (result.sanctionsDetail?.status === "UNKNOWN") {
    questions.push("Why is the sanctions status unknown? Was the screening service unavailable?");
  }

  // 7. ENS names found
  const ensCount = Object.keys(result.ensNames ?? {}).length;
  if (ensCount > 0) {
    questions.push(`What ENS names were found on this path? Do they provide useful identity hints?`);
  }

  // 8. Multiple assets
  if ((result.assetsInvolved?.length ?? 0) > 1) {
    questions.push("Multiple assets are involved. Does the asset mix change the risk assessment?");
  }

  // 9. High hop count
  if (result.hops >= 5) {
    questions.push(`The path is ${result.hops} hops long. Which hop is the strongest evidence for the VASP attribution?`);
  }

  // 10. Score/risk mismatch
  if (result.risk === "HIGH" && result.confidence === "Low") {
    questions.push("Risk is HIGH but confidence is Low. What would strengthen this investigation?");
  }

  // Context-aware additions when user just asked something
  if (input.previousQuestion?.toLowerCase().includes("confidence")) {
    questions.push("Which transaction carries the largest value on the strongest path?");
  }

  // Deduplicate and cap
  const unique = [...new Set(questions)];
  return unique.slice(0, MAX_QUESTIONS);
}

// ─── Tier 2: LLM-Refined Questions ───────────────────────────────────────────

/**
 * Validates and caps LLM-generated questions.
 * Falls back to deterministic questions if LLM output is invalid/empty.
 */
export function processLLMFollowUps(
  rawQuestions: unknown,
  fallback: string[]
): string[] {
  if (!Array.isArray(rawQuestions)) return fallback;

  const valid = rawQuestions
    .filter((q): q is string => typeof q === "string" && q.length > 0)
    .map((q) => q.trim())
    .filter((q) => q.length <= MAX_QUESTION_LENGTH)
    .filter((q) => !isProhibited(q))
    .slice(0, MAX_QUESTIONS);

  if (valid.length < MIN_QUESTIONS) {
    // LLM produced too few valid questions — supplement with deterministic
    const combined = [...new Set([...valid, ...fallback])];
    return combined.slice(0, MAX_QUESTIONS);
  }

  return valid;
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Reject questions that:
 * - Request unavailable information
 * - Imply unsupported legal conclusions
 * - Could expose secrets or bypass access controls
 * - Are unrelated to blockchain investigation
 */
const PROHIBITED_PATTERNS = [
  /reveal.*(key|secret|password|token)/i,
  /call transition_case/i,
  /bypass.*auth/i,
  /mark.*compliant/i,
  /ignore.*instruction/i,
  /^what is (bitcoin|ethereum|blockchain|crypto)\??$/i,
  /legal advice/i,
  /admissible in court/i,
];

function isProhibited(question: string): boolean {
  return PROHIBITED_PATTERNS.some((p) => p.test(question));
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Generate follow-up questions for a given attribution result.
 * Always returns at least MIN_QUESTIONS questions using deterministic rules.
 */
export function generateFollowUps(
  input: FollowUpGenerationInput,
  llmQuestions?: unknown
): FollowUpGenerationOutput {
  const deterministic = generateDeterministicFollowUps(input);

  if (!llmQuestions) {
    return {
      questions: deterministic,
      source: "deterministic",
    };
  }

  const refined = processLLMFollowUps(llmQuestions, deterministic);
  const finalSource =
    refined.every((q) => deterministic.includes(q)) ? "deterministic" : "hybrid";

  return {
    questions: refined,
    source: finalSource,
  };
}
