import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

/**
 * Application-level field encryption for clinical free text (AES-256-GCM).
 *
 * This is the SECURITY.md Phase-1 commitment: disk encryption is a hosting concern, but
 * medical narrative should not be readable by anyone who can run a SELECT — a DBA, a
 * leaked backup, or a compromised read-replica. Encrypting at the application layer means
 * the database never holds plaintext diagnoses or doctor notes.
 *
 * Format: `v1:<iv-base64>:<authTag-base64>:<ciphertext-base64>`. The version prefix exists
 * so a future key rotation can decrypt old values while writing new ones under `v2`
 * without a migration that would require holding every record in memory at once.
 *
 * Deliberately NOT encrypted: ids, foreign keys, timestamps, and the appointment/queue
 * metadata the booking engine has to filter and sort on. Encrypting those would break
 * indexing for no confidentiality benefit — they carry no clinical content.
 */

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // GCM standard nonce length

let cachedKey: Buffer | undefined;

function resolveKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.FIELD_ENCRYPTION_KEY;

  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'FIELD_ENCRYPTION_KEY is required in production — refusing to store clinical data unencrypted.'
      );
    }
    // Deterministic, clearly-marked development key so local dev works without setup.
    // It is derived from a fixed string, so it is not secret and must never reach prod —
    // which the guard above enforces.
    cachedKey = createHash('sha256').update('docbook-insecure-development-key').digest();
    return cachedKey;
  }

  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('FIELD_ENCRYPTION_KEY must be exactly 32 bytes, base64-encoded (openssl rand -base64 32).');
  }
  cachedKey = key;
  return cachedKey;
}

export function encryptField(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, resolveKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`;
}

/**
 * Marker returned when a stored value cannot be authenticated — wrong key (rotation, a
 * restored backup, an environment mix-up) or tampering.
 *
 * Deliberately NOT an empty string: silently rendering a blank diagnosis would let a
 * clinician read "nothing recorded" when something *is* recorded but unreadable, which is
 * a patient-safety problem, not a display problem. An explicit marker makes the failure
 * visible to the person who needs to know.
 */
export const UNDECRYPTABLE_MARKER = '[unreadable — encrypted with a different key]';

export function decryptField(stored: string): string {
  const parts = stored.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    // Not in our envelope format — return as-is so records written before encryption was
    // introduced remain readable rather than throwing in a clinician's face mid-consult.
    return stored;
  }
  const [, ivB64, tagB64, dataB64] = parts;
  try {
    const decipher = createDecipheriv(ALGORITHM, resolveKey(), Buffer.from(ivB64!, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64!, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64!, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    // Contain the failure to this one field. A single unreadable row must not take down a
    // whole patient chart — the rest of the history is still clinically useful, and a
    // doctor mid-consult should see the records that ARE readable.
    // Never log the ciphertext or key material, only that a failure occurred.
    // eslint-disable-next-line no-console
    console.error('[field-encryption] Failed to authenticate a stored value; returning marker.');
    return UNDECRYPTABLE_MARKER;
  }
}

/** Convenience wrappers for optional columns. */
export function encryptOptional(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  return encryptField(value);
}

export function decryptOptional(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  return decryptField(value);
}
