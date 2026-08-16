import { createHmac, timingSafeEqual, createHash } from 'node:crypto';

/**
 * Shared HMAC signing for `/api/v1/files/download` links — used by every StorageProvider
 * regardless of where the bytes actually live. Extracted out of LocalStorageAdapter so the
 * S3 adapter can share it exactly rather than re-implementing it: the download route always
 * proxies through our own signature + session + clinical-permission checks (see that
 * route's doc comment), so `getSignedUrl` never returns a raw S3 presigned URL — that would
 * bypass the per-patient authorization check that route exists to enforce.
 */
function secretBytes(): Buffer {
  const raw = process.env.NEXTAUTH_SECRET;
  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('NEXTAUTH_SECRET is required to sign storage URLs.');
    }
    return createHash('sha256').update('docbook-insecure-development-url-signing').digest();
  }
  return createHash('sha256').update(raw).digest();
}

function sign(key: string, expires: number): string {
  return createHmac('sha256', secretBytes()).update(`${key}:${expires}`).digest('hex');
}

export function verifyStorageSignature(key: string, expires: number, signature: string): boolean {
  if (!Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000)) return false;
  const expected = sign(key, expires);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(signature, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function buildSignedDownloadUrl(key: string, expiresInSeconds: number): string {
  const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const signature = sign(key, expires);
  const params = new URLSearchParams({ key, expires: String(expires), signature });
  return `/api/v1/files/download?${params.toString()}`;
}
