import type { 
  VaspClassificationDetails, 
  VaspClassification, 
  LegalInstrument 
} from "../../../packages/shared-types";

/**
 * Maps FIU-IND compliance classifications to available legal instruments.
 */
export function getInstrumentsForClassification(classification: VaspClassification): LegalInstrument[] {
  switch (classification) {
    case 'onshore_registered':
      return ['SAHYOG'];
    case 'offshore_registered':
      return ['SAHYOG', 'MLAT'];
    case 'offshore_non_compliant':
      return ['BLOCKING_ORDER', 'MLAT'];
    case 'unknown':
    default:
      return ['MLAT'];
  }
}

/**
 * Heuristic mapping for known exchanges based on late-2023/2024 FIU-IND public notices.
 * In a production environment, this would be backed by a dynamic database 
 * populated by official FIU-IND publications.
 */
const CLASSIFICATION_MAP: Record<string, VaspClassification> = {
  // Onshore registered entities
  'wazirx': 'onshore_registered',
  'coindcx': 'onshore_registered',
  'coinswitch': 'onshore_registered',
  'zebpay': 'onshore_registered',

  // Offshore registered entities (recently registered with FIU-IND)
  'binance': 'offshore_registered',
  'kucoin': 'offshore_registered',

  // Offshore non-compliant (issued show-cause notices / URLs blocked)
  'huobi': 'offshore_non_compliant',
  'kraken': 'offshore_non_compliant',
  'gate.io': 'offshore_non_compliant',
  'bittrex': 'offshore_non_compliant',
  'bitstamp': 'offshore_non_compliant',
  'mexc': 'offshore_non_compliant',
  'bitfinex': 'offshore_non_compliant',
};

/**
 * Normalizes a VASP label to match our internal map keys.
 */
function normalizeVaspName(name: string): string {
  // e.g. "Binance 14" -> "binance"
  const lower = name.toLowerCase().trim();
  const firstWord = lower.split(/[\s_-]+/)[0];
  if (firstWord && CLASSIFICATION_MAP[firstWord]) {
    return firstWord;
  }
  // Try exact match
  for (const key of Object.keys(CLASSIFICATION_MAP)) {
    if (lower.includes(key)) {
      return key;
    }
  }
  return lower;
}

/**
 * Returns the VASP classification details for a given VASP label.
 */
export function getVaspClassification(vaspLabel: string | null): VaspClassificationDetails {
  if (!vaspLabel) {
    return {
      classification: 'unknown',
      sourceReference: 'FIU-IND Public Registry',
      lastSyncedAt: new Date().toISOString(),
      availableInstruments: getInstrumentsForClassification('unknown'),
    };
  }

  const normalized = normalizeVaspName(vaspLabel);
  const classification = CLASSIFICATION_MAP[normalized] || 'unknown';

  return {
    classification,
    sourceReference: 'FIU-IND Public Registry',
    lastSyncedAt: new Date().toISOString(),
    availableInstruments: getInstrumentsForClassification(classification),
  };
}
