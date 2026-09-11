/**
 * lib/validation.ts
 *
 * Shared Ethereum address validation helper.
 * Used by both /api/attribute and /api/attribute-stream routes.
 */

/** Strict Ethereum address regex: "0x" followed by exactly 40 hex characters. */
const ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** Returns true if the string is a valid Ethereum address (checksummed or lowercase). */
export function isValidEthAddress(address: string): boolean {
  return ETH_ADDRESS_RE.test(address);
}
