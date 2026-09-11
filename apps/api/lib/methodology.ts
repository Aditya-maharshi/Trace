/**
 * lib/methodology.ts
 *
 * Methodology and liability disclosure metadata for attribution responses.
 * Provides transparent, synchronized disclosures regarding:
 *   1. Fixed VASP registry size and non-commercial scope.
 *   2. OpenSanctions free-tier community API source.
 *   3. Mandatory human review requirement (automated lead, not legal determination).
 *   4. Empirical confidence calibration date, sample size, and recommended thresholds.
 */

import { CALIBRATION_METADATA } from "./attribution";
import { buildVaspSet } from "./vaspLabels";
import type { MethodologyDisclosure } from "../../../packages/shared-types";

/**
 * Returns the standardized methodology and limitations disclosure object.
 * VASP registry size is computed dynamically to avoid documentation drift.
 * Calibration metadata is imported directly from lib/attribution.ts.
 */
export function getMethodologyDisclosure(): MethodologyDisclosure {
  const vaspCount = buildVaspSet().size;

  return {
    notice: "Investigative lead only — not a formal compliance or legal determination.",
    vaspRegistryNotice: `The VASP registry is a fixed list of ${vaspCount} publicly-known exchange deposit and hot wallet addresses, not an exhaustive or commercial dataset. Unlisted VASPs, private OTC desks, and novel services will not be identified.`,
    sanctionsSource: "Sanctions screening is powered by OpenSanctions free-tier community API. Newly designated addresses or aliases may not appear immediately.",
    humanReviewDisclaimer: "Attribution and risk scoring are automated pattern-matching heuristics intended as investigative leads only. They do not constitute legal or compliance determinations. Rigorous human review is required before taking any regulatory, legal, or account action.",
    calibrationDate: CALIBRATION_METADATA.calibratedAt,
    calibrationSample: `${CALIBRATION_METADATA.knownSampleCount} known VASP-linked wallets + ${CALIBRATION_METADATA.randomSampleCount} random wallets`,
    calibratedHighThreshold: CALIBRATION_METADATA.calibratedHighThreshold,
    calibratedLowThreshold: CALIBRATION_METADATA.calibratedLowThreshold,
    activeHighThreshold: CALIBRATION_METADATA.activeHighThreshold,
    activeLowThreshold: CALIBRATION_METADATA.activeMediumThreshold,
    limitationsDocument: "See LIMITATIONS.md for comprehensive methodology, token allowlist, and structuring detection boundaries.",
  };
}
