/**
 * lib/domains/core/encryption.ts
 *
 * AES-256-GCM envelope encryption for sensitive data stored at rest.
 *
 * ### Key management
 * The encryption key is a 32-byte (256-bit) value sourced from the
 * ENCRYPTION_KEY env var (64 hex characters, e.g. the output of
 * `openssl rand -hex 32`).
 *
 * In PRODUCTION:
 *   - Missing or malformed key → startup error (consistent with GEMINI_API_KEY
 *     fail-fast pattern already in this codebase).
 *
 * In DEVELOPMENT (NODE_ENV !== "production"):
 *   - Missing key → warning logged + dev-only fallback key used.
 *   - The dev fallback key is hardcoded and NOT secret — it is only for
 *     local development to avoid breaking the dev workflow.
 *
 * ### Cipher
 * AES-256-GCM provides:
 *   - Confidentiality (AES-256 CBC-equivalent strength)
 *   - Authentication (GCM tag verifies integrity without a separate HMAC)
 *   - Unique ciphertext per encryption (fresh 12-byte IV per call)
 *
 * ### Wire format
 * Encrypted blobs are stored as JSON:
 *   { v: 1, iv: "<base64 12 bytes>", tag: "<base64 16 bytes>", ct: "<base64 ciphertext>" }
 *
 * The `v` field is a version number so we can rotate the cipher in future
 * without breaking existing stored blobs (just add a v:2 decrypt path).
 */

import crypto from "crypto";

// ─────────────────────────────────────────────────────────────────────────────
// Key resolution (fail-fast pattern matching existing GEMINI_API_KEY check)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Development-only fallback key.
 * ⚠ NOT SECRET — hardcoded and publicly visible. Only used in non-production.
 */
const DEV_FALLBACK_KEY_HEX =
  "0000000000000000000000000000000000000000000000000000000000000000";

let _resolvedKey: Buffer | null = null;

function resolveEncryptionKey(): Buffer {
  if (_resolvedKey) return _resolvedKey;

  const raw = process.env.ENCRYPTION_KEY;

  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "[encryption] STARTUP FAILURE: ENCRYPTION_KEY env var is not set. " +
        "Generate one with: openssl rand -hex 32 " +
        "and add it to your production environment secrets."
      );
    }
    console.warn(
      "[encryption] ENCRYPTION_KEY is not set. Using dev-only fallback key. " +
      "This key is NOT secret — set ENCRYPTION_KEY in production."
    );
    _resolvedKey = Buffer.from(DEV_FALLBACK_KEY_HEX, "hex");
    return _resolvedKey;
  }

  const stripped = raw.trim();
  if (!/^[0-9a-fA-F]{64}$/.test(stripped)) {
    throw new Error(
      "[encryption] ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). " +
      `Got a value of length ${stripped.length}. ` +
      "Generate a valid key with: openssl rand -hex 32"
    );
  }

  _resolvedKey = Buffer.from(stripped, "hex");
  return _resolvedKey;
}

// We do NOT validate at module load time because Next.js evaluates modules during
// the build step (next build), where runtime secrets like ENCRYPTION_KEY may not
// yet be injected. It will fail on first use instead.

// ─────────────────────────────────────────────────────────────────────────────
// Encrypted envelope shape
// ─────────────────────────────────────────────────────────────────────────────

interface EncryptedEnvelope {
  /** Schema version — allows future cipher rotation. */
  v: 1;
  /** Base64-encoded 12-byte IV (nonce). Fresh per encryption. */
  iv: string;
  /** Base64-encoded 16-byte GCM authentication tag. */
  tag: string;
  /** Base64-encoded ciphertext. */
  ct: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Encrypt / decrypt
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Encrypt `plaintext` with AES-256-GCM and return a JSON string.
 *
 * Each call generates a fresh 12-byte IV — identical plaintexts produce
 * different ciphertexts (IND-CPA secure).
 */
export function encrypt(plaintext: string): string {
  const key = resolveEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const ct = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  const envelope: EncryptedEnvelope = {
    v: 1,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ct: ct.toString("base64"),
  };

  return JSON.stringify(envelope);
}

/**
 * Encrypt an arbitrary JSON-serialisable value.
 * Convenience wrapper around `encrypt(JSON.stringify(value))`.
 */
export function encryptJson<T>(value: T): string {
  return encrypt(JSON.stringify(value));
}

/**
 * Decrypt a blob produced by `encrypt()`.
 *
 * @throws if the blob is malformed, the key is wrong, or the tag fails
 *   (indicating corruption or tampering).
 */
export function decrypt(blob: string): string {
  let envelope: EncryptedEnvelope;
  try {
    envelope = JSON.parse(blob) as EncryptedEnvelope;
  } catch {
    throw new Error("[encryption] decrypt: blob is not valid JSON");
  }

  if (envelope.v !== 1) {
    throw new Error(`[encryption] decrypt: unknown envelope version ${envelope.v}`);
  }

  const key = resolveEncryptionKey();
  const iv = Buffer.from(envelope.iv, "base64");
  const tag = Buffer.from(envelope.tag, "base64");
  const ct = Buffer.from(envelope.ct, "base64");

  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(ct) + decipher.final("utf8");
  } catch {
    throw new Error(
      "[encryption] decrypt: authentication failed — data may be corrupt or key is incorrect"
    );
  }
}

/**
 * Decrypt a JSON blob and parse it back to the original type.
 * Convenience wrapper around `JSON.parse(decrypt(blob))`.
 */
export function decryptJson<T>(blob: string): T {
  return JSON.parse(decrypt(blob)) as T;
}

/**
 * Return true if `value` is an encrypted envelope (produced by `encrypt()`).
 * Used by resultStore.ts to distinguish encrypted from plaintext payloads
 * during the migration window.
 */
export function isEncryptedEnvelope(value: string): boolean {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && parsed.v === 1 && "ct" in parsed;
  } catch {
    return false;
  }
}
