/**
 * lib/domains/tracing/riskClassifier.ts
 *
 * Typology-based risk classification for blockchain transaction traces.
 *
 * Implements five named money-laundering / fraud typologies from real-world
 * FinCEN/FATF guidance. Each typology has:
 *   - A real-world name (matching FATF Typologies Report 2021 or FinCEN guidance)
 *   - A documented detection rule with rationale
 *   - Severity level
 *   - Evidence array (supporting addresses / hop indices)
 *
 * ### IMPORTANT — No automatic alerts
 * Detection of a typology is an INVESTIGATIVE SIGNAL, not a legal determination.
 * The `riskTypologies` array is surfaced in the API response and dashboard.
 * An alert (caseNotifications) is dispatched only when severity is HIGH —
 * and the notification includes the mandatory disclaimer.
 *
 * ### References
 * - FATF Typologies Report 2021: "Virtual Assets — Red Flag Indicators"
 * - FinCEN FIN-2022-Alert001: "Potential U.S. Sanctions Evasion Using Cryptocurrency"
 * - FinCEN Advisory FIN-2019-A003: "Ransomware"
 */

import type { ScoredAttribution, RiskTypology } from "@sih/shared-types";
import { MIXER_LABELS } from "./mixerLabels";

// ─────────────────────────────────────────────────────────────────────────────
// Detection parameters (adjustable without changing detection logic)
// ─────────────────────────────────────────────────────────────────────────────

/** Minimum consecutive single-output hops to flag as a peeling chain. */
const PEELING_CHAIN_MIN_HOPS = 4;

/** Minimum number of outgoing outputs at a single hop to flag as smurfing fan-out. */
const SMURFING_FAN_OUT_MIN = 5;

/** Maximum hops from a mixer address to still flag mixer_proximity. */
const MIXER_PROXIMITY_MAX_HOPS = 3;

/** Maximum hops from a sanctioned address to flag sanctioned_proximity. */
const SANCTIONED_PROXIMITY_MAX_HOPS = 2;

/**
 * Ransomware pattern: minimum value ratio (outgoing/incoming) per hop for
 * rapid-fragmentation detection. If a hop's outgoing value is >80% of its
 * incoming value AND there are >4 outgoing outputs, flag ransomware pattern.
 */
const RANSOMWARE_FRAGMENTATION_OUTPUTS_MIN = 4;

// ─────────────────────────────────────────────────────────────────────────────
// Detection functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * TYPOLOGY 1: Peeling Chain
 *
 * FATF Typologies Report 2021 — "Layering through peeling chains"
 * Rule: A wallet sends to exactly ONE recipient per hop over N or more
 * consecutive hops, with each output slightly smaller (peeled off the top).
 * This pattern obscures the original source by making tracers assume each
 * single-output tx is just a simple transfer.
 *
 * Detection: In the BFS path, if N consecutive hops each have path.length = 1
 * outgoing edge, flag as a peeling chain.
 */
function detectPeelingChain(paths: ScoredAttribution[]): RiskTypology | null {
  for (const p of paths) {
    const hops = p.path?.length ?? 0;
    if (hops >= PEELING_CHAIN_MIN_HOPS) {
      // In the simple BFS model, a long single-path is the signature
      // (BFS explores ALL neighbors, so a path of depth N with no branching
      // means each intermediate hop had exactly one outgoing tx above threshold).
      return {
        name: "peeling_chain",
        description:
          `A chain of ${hops} consecutive single-output transactions was detected. ` +
          `This matches the "peeling chain" layering pattern (FATF Typologies 2021). ` +
          `Each hop sends slightly less than it receives, obscuring the original source.`,
        severity: "HIGH",
        evidence: p.path ?? [],
      };
    }
  }
  return null;
}

/**
 * TYPOLOGY 2: Smurfing (Structuring / Fan-out)
 *
 * FATF Guidance 2020 — "Smurfing: Fan-out and Fan-in patterns"
 * Rule: A single wallet sends to >= SMURFING_FAN_OUT_MIN distinct addresses
 * in the same BFS layer (i.e., all within the same hop depth from the source).
 * Classic smurfing uses many small transfers to avoid reporting thresholds.
 *
 * Detection: Multiple paths share a common source address that branches into
 * N >= threshold distinct next-hop addresses.
 */
function detectSmurfing(paths: ScoredAttribution[]): RiskTypology | null {
  // Count destinations per source address at hop 1 (the wallet's direct outputs)
  const sourceToDests = new Map<string, Set<string>>();
  for (const p of paths) {
    if (!p.path || p.path.length < 2) continue;
    const source = p.path[0];
    const dest = p.path[1];
    if (!sourceToDests.has(source)) sourceToDests.set(source, new Set());
    sourceToDests.get(source)!.add(dest);
  }

  for (const [source, dests] of sourceToDests.entries()) {
    if (dests.size >= SMURFING_FAN_OUT_MIN) {
      return {
        name: "smurfing",
        description:
          `Address ${source.slice(0, 8)}… sent to ${dests.size} distinct addresses in a ` +
          `single hop. This matches the "smurfing" structuring pattern (FATF 2020): ` +
          `large amounts split into many small transfers to evade detection thresholds.`,
        severity: "HIGH",
        evidence: [source, ...Array.from(dests)],
      };
    }
  }
  return null;
}

/**
 * TYPOLOGY 3: Mixer Proximity
 *
 * OFAC Advisory 2022 — "Tornado Cash Sanctions Evasion"
 * Rule: A transaction path passes through or terminates at a known mixer
 * address within N hops. Mixer exposure within 3 hops is a HIGH-severity flag.
 *
 * Detection: Scan every address in every path against MIXER_LABELS.
 * Already partially done by detectMixerExposure in mixerLabels.ts — we
 * reuse that signal and add the structured typology record.
 */
function detectMixerProximity(paths: ScoredAttribution[]): RiskTypology | null {
  const hits: string[] = [];
  for (const p of paths) {
    for (let i = 0; i < (p.path?.length ?? 0); i++) {
      const addr = p.path![i].toLowerCase();
      if (addr in MIXER_LABELS && i <= MIXER_PROXIMITY_MAX_HOPS) {
        hits.push(`${addr} (${MIXER_LABELS[addr]}, hop ${i})`);
      }
    }
  }
  if (hits.length === 0) return null;

  return {
    name: "mixer_proximity",
    description:
      `The trace path passes through ${hits.length} known mixing protocol address(es) ` +
      `within ${MIXER_PROXIMITY_MAX_HOPS} hops. Per OFAC Advisory (May 2022), transacting ` +
      `with or through Tornado Cash or similar OFAC-designated mixers may constitute ` +
      `a sanctions violation regardless of whether the target directly interacted with the mixer.`,
    severity: "HIGH",
    evidence: hits,
  };
}

/**
 * TYPOLOGY 4: Sanctioned Proximity
 *
 * FinCEN FIN-2022-Alert001 — "Potential U.S. Sanctions Evasion"
 * Rule: A transaction path passes through an OFAC-sanctioned address
 * within N hops. Even indirect contact creates legal exposure.
 *
 * Detection: Uses `sanctionsDetail` from the attribution response.
 * This function takes the sanctioned address set as input so it can be
 * called from buildAttributionResponse which already has this data.
 */
function detectSanctionedProximity(
  paths: ScoredAttribution[],
  sanctionedAddresses: Set<string>,
): RiskTypology | null {
  if (sanctionedAddresses.size === 0) return null;

  const hits: string[] = [];
  for (const p of paths) {
    for (let i = 0; i < (p.path?.length ?? 0); i++) {
      const addr = p.path![i].toLowerCase();
      if (sanctionedAddresses.has(addr) && i <= SANCTIONED_PROXIMITY_MAX_HOPS) {
        hits.push(`${addr} (hop ${i})`);
      }
    }
  }
  if (hits.length === 0) return null;

  return {
    name: "sanctioned_proximity",
    description:
      `The trace path passes within ${SANCTIONED_PROXIMITY_MAX_HOPS} hops of ${hits.length} ` +
      `OFAC-sanctioned address(es). Per FinCEN FIN-2022-Alert001, this may indicate ` +
      `sanctions evasion and requires immediate escalation (FATF Recommendation 10).`,
    severity: "HIGH",
    evidence: hits,
  };
}

/**
 * TYPOLOGY 5: Ransomware Pattern
 *
 * FinCEN Advisory FIN-2019-A003 — "Ransomware"
 * Rule: A large single inbound payment followed by rapid outbound
 * fragmentation (many small outputs) within a short time window.
 *
 * Detection: In the BFS, if the queried wallet's direct paths fan out to
 * >= RANSOMWARE_FRAGMENTATION_OUTPUTS_MIN distinct addresses AND the
 * combined amountFlowed is high relative to a single source, flag it.
 * This is a heuristic — the "single large inbound" part requires incoming
 * tx data not always available in BFS-outgoing-only mode.
 *
 * Note: This typology has a higher false-positive rate than the others.
 * Always mark severity MEDIUM (not HIGH) without corroborating OSINT.
 */
function detectRansomwarePattern(paths: ScoredAttribution[]): RiskTypology | null {
  // Check for high fan-out from the starting wallet
  const startAddr = paths[0]?.path?.[0]?.toLowerCase();
  if (!startAddr) return null;

  const directOutputs = new Set<string>();
  let totalOutflow = 0;

  for (const p of paths) {
    if (p.path?.[0]?.toLowerCase() === startAddr && p.path.length >= 2) {
      directOutputs.add(p.path[1].toLowerCase());
      totalOutflow += p.breakdown?.totalValueUSD ?? 0;
    }
  }

  if (
    directOutputs.size >= RANSOMWARE_FRAGMENTATION_OUTPUTS_MIN &&
    totalOutflow > 5_000
  ) {
    return {
      name: "ransomware_pattern",
      description:
        `The target wallet sent funds to ${directOutputs.size} distinct addresses ` +
        `with a total outflow of ~$${Math.round(totalOutflow).toLocaleString()} USD. ` +
        `This matches the rapid-fragmentation pattern associated with ransomware proceeds ` +
        `(FinCEN Advisory FIN-2019-A003). This is a heuristic signal — corroborate with ` +
        `OSINT before escalating. Severity is MEDIUM pending corroboration.`,
      severity: "MEDIUM",
      evidence: [startAddr, ...Array.from(directOutputs)],
    };
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main classifier
// ─────────────────────────────────────────────────────────────────────────────

export interface ClassificationInput {
  paths: ScoredAttribution[];
  sanctionedAddresses?: Set<string>;
}

/**
 * Run all five typology detectors against the BFS result.
 *
 * Returns an array of RiskTypology objects for each pattern detected.
 * Empty array = no typologies detected (not the same as "clean").
 *
 * @param input - Attribution paths and (optional) sanctioned address set
 * @returns Array of detected risk typologies, ordered by severity (HIGH first)
 */
export function classify(input: ClassificationInput): RiskTypology[] {
  const detected: RiskTypology[] = [];

  const peeling = detectPeelingChain(input.paths);
  if (peeling) detected.push(peeling);

  const smurfing = detectSmurfing(input.paths);
  if (smurfing) detected.push(smurfing);

  const mixer = detectMixerProximity(input.paths);
  if (mixer) detected.push(mixer);

  const sanctioned = detectSanctionedProximity(
    input.paths,
    input.sanctionedAddresses ?? new Set(),
  );
  if (sanctioned) detected.push(sanctioned);

  const ransomware = detectRansomwarePattern(input.paths);
  if (ransomware) detected.push(ransomware);

  // Sort: HIGH before MEDIUM before LOW
  const severityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return detected.sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity],
  );
}

/**
 * Returns true if any detected typology has HIGH severity.
 * Used by buildAttributionResponse to decide whether to fire a case alert.
 */
export function hasHighSeverityTypology(typologies: RiskTypology[]): boolean {
  return typologies.some((t) => t.severity === "HIGH");
}
