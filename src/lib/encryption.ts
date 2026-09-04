/**
 * Field-level encryption for sensitive employee PII.
 *
 * Uses AES-256-GCM (authenticated encryption) with a random 96-bit IV
 * per encryption call.  The ciphertext is stored as a base64 string:
 *
 *   base64(iv + authTag + ciphertext)
 *
 * The encryption key is read from the ENCRYPTION_KEY environment variable
 * (a 64-character hex string representing 32 bytes).
 *
 * When ENCRYPTION_KEY is not set (e.g. local dev with a fresh DB),
 * encrypt/decrypt are transparent pass-throughs so development is
 * frictionless.  Production MUST set the key.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits — recommended for GCM
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer | null {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) return null;
  const buf = Buffer.from(hex, 'hex');
  if (buf.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  }
  return buf;
}

/**
 * Encrypt a plaintext string.  Returns the ciphertext (base64) or the
 * original value when no encryption key is configured.
 */
export function encrypt(plaintext: string | null): string | null {
  if (plaintext === null || plaintext === undefined) return plaintext;
  const key = getKey();
  if (!key) return plaintext;

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

/**
 * Decrypt a ciphertext string produced by `encrypt()`.  Returns the
 * original plaintext or the value itself when no encryption key is
 * configured (pass-through for dev).
 */
export function decrypt(ciphertext: string | null): string | null {
  if (ciphertext === null || ciphertext === undefined) return ciphertext;
  const key = getKey();
  if (!key) return ciphertext;

  const buf = Buffer.from(ciphertext, 'base64');
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

/** Fields on the Employee model that contain PII and must be encrypted. */
export const PII_FIELDS = ['nationalId', 'accountNumber', 'taxNumber'] as const;

type PiiKey = (typeof PII_FIELDS)[number];

/**
 * Encrypt all PII fields present in a record (for storage).
 * Only encrypts fields that actually exist on the object.
 */
export function encryptPii<T extends Record<string, unknown>>(record: T): T {
  const out = { ...record };
  for (const field of PII_FIELDS) {
    if (field in out && out[field] != null) {
      (out as Record<string, unknown>)[field] = encrypt(out[field] as string);
    }
  }
  return out;
}

/**
 * Decrypt all PII fields present in a record (for API responses).
 * Only decrypts fields that actually exist on the object, so partial
 * Prisma selects (e.g. only `accountNumber`) work without error.
 */
export function decryptPii<T extends Record<string, unknown>>(record: T): T {
  const out = { ...record };
  for (const field of PII_FIELDS) {
    if (field in out && out[field] != null) {
      (out as Record<string, unknown>)[field] = decrypt(out[field] as string);
    }
  }
  return out;
}

/**
 * Decrypt PII fields in an array of records.
 */
export function decryptPiiArray<T extends Record<string, unknown>>(records: T[]): T[] {
  return records.map(decryptPii);
}
