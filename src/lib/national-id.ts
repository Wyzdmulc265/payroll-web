import { createHash, createHmac } from 'node:crypto';

function normalizeNationalId(nationalId: string): string {
  return nationalId.trim().toLowerCase();
}

function legacyNationalIdHash(nationalId: string): string {
  return createHash('sha256').update(normalizeNationalId(nationalId)).digest('hex');
}

export function hashNationalId(nationalId: string): string {
  const configuredKey = process.env.ENCRYPTION_KEY;
  if (!configuredKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ENCRYPTION_KEY is required to hash national IDs in production');
    }
    return legacyNationalIdHash(nationalId);
  }

  if (!/^[a-f\d]{64}$/i.test(configuredKey)) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string');
  }

  return createHmac('sha256', Buffer.from(configuredKey, 'hex'))
    .update('national-id-dedup:v1\0')
    .update(normalizeNationalId(nationalId))
    .digest('hex');
}

export function nationalIdHashCandidates(nationalId: string): string[] {
  return [...new Set([hashNationalId(nationalId), legacyNationalIdHash(nationalId)])];
}